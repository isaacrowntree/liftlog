"use client";

/** Switch a user's active program to another template — WITHOUT touching
 * their history. Workouts, sets and exercises are preserved; only the
 * program/day/programExercise rows are replaced. Exercises resolve to stable
 * ids by name, so a shared lift (Squat, Bench…) keeps its logged history and
 * progress chart, and its current working weight carries into the new
 * program. Switching is therefore lossless and reversible in either
 * direction. */

import { db } from "./db";
import type { Exercise, Program, ProgramExercise } from "@/lib/types";
import {
  getTemplate,
  slugName,
  type ProgramTemplate,
} from "@/lib/programTemplates";

const DEFAULT_INCREMENT = 2.5;
const DEFAULT_DELOAD_PCT = 0.1;
const DEFAULT_DELOAD_FAILS = 3;

export function exerciseId(userId: string, name: string): string {
  return `ex-${userId}-${slugName(name)}`;
}

/** Heaviest working weight logged per exercise across the current program —
 * carried forward so a switch never loses your progress. */
export async function captureWorkingWeights(
  userId: string,
): Promise<Map<string, number>> {
  const program = await db.programs.where({ userId }).first();
  const weights = new Map<string, number>();
  if (!program) return weights;
  const dayIds = (await db.programDays.where({ programId: program.id }).toArray()).map(
    (d) => d.id,
  );
  const pes = await db.programExercises.where("programDayId").anyOf(dayIds).toArray();
  for (const pe of pes) {
    if (pe.workingWeightKg === undefined) continue;
    const prev = weights.get(pe.exerciseId);
    // Keep the heaviest (works for assisted negatives too: less assistance).
    if (prev === undefined || pe.workingWeightKg > prev) {
      weights.set(pe.exerciseId, pe.workingWeightKg);
    }
  }
  return weights;
}

/** Build fresh program/day/programExercise rows from a template. Reuses
 * existing exercises by id; only adds ones that don't exist yet. Returns the
 * new program id. Runs inside the caller's transaction. */
export async function buildProgramFromTemplate(
  userId: string,
  template: ProgramTemplate,
  carriedWeights: Map<string, number> = new Map(),
): Promise<string> {
  const programId = `program-${template.id}-${userId}`;
  const program: Program = {
    id: programId,
    userId,
    name: template.name,
    mode: template.mode,
    templateId: template.id,
  };
  await db.programs.put(program);

  const days = template.days.map((d, i) => ({
    id: `day-${template.id}-${d.key}-${userId}`,
    programId,
    position: i,
    name: d.name,
  }));
  await db.programDays.bulkPut(days);

  const newExercises: Exercise[] = [];
  const pes: ProgramExercise[] = [];
  for (let di = 0; di < template.days.length; di++) {
    const day = template.days[di];
    for (let pos = 0; pos < day.exercises.length; pos++) {
      const te = day.exercises[pos];
      const exId = exerciseId(userId, te.name);
      if (!(await db.exercises.get(exId)) && !newExercises.some((e) => e.id === exId)) {
        newExercises.push({
          id: exId,
          userId,
          name: te.name,
          kind: te.kind,
          restSeconds: te.restSeconds ?? 90,
        });
      }
      const weighted = te.kind === "weighted";
      const increment = te.incrementKg ?? (weighted ? DEFAULT_INCREMENT : 0);
      pes.push({
        id: `pe-${days[di].id}-${pos}`,
        programDayId: days[di].id,
        exerciseId: exId,
        position: pos,
        sets: te.sets,
        targetReps: te.kind === "timed" ? undefined : te.reps,
        targetSeconds: te.kind === "timed" ? te.seconds : undefined,
        ...(weighted
          ? {
              workingWeightKg: carriedWeights.get(exId) ?? te.startKg ?? 0,
              incrementKg: increment,
              deloadPct: DEFAULT_DELOAD_PCT,
              deloadAfterFails: DEFAULT_DELOAD_FAILS,
            }
          : { incrementKg: increment }),
        ...(te.restSeconds !== undefined ? { restSeconds: te.restSeconds } : {}),
        ...(te.madcowRole
          ? { madcowRole: te.madcowRole, madcowProgresses: te.madcowProgresses ?? false }
          : {}),
      });
    }
  }
  if (newExercises.length) await db.exercises.bulkAdd(newExercises);
  await db.programExercises.bulkPut(pes);
  return programId;
}

/** Replace the user's active program with the given template. History
 * (workouts, sets) and exercise identities are untouched. */
export async function switchProgram(
  userId: string,
  templateId: string,
): Promise<void> {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown program template: ${templateId}`);

  const carried = await captureWorkingWeights(userId);

  await db.transaction(
    "rw",
    [db.programs, db.programDays, db.programExercises, db.exercises],
    async () => {
      // Remove ONLY the old program structure — never exercises/workouts/sets.
      const oldPrograms = await db.programs.where({ userId }).toArray();
      for (const p of oldPrograms) {
        const dayIds = (await db.programDays.where({ programId: p.id }).toArray()).map(
          (d) => d.id,
        );
        await db.programExercises.where("programDayId").anyOf(dayIds).delete();
        await db.programDays.where({ programId: p.id }).delete();
      }
      await db.programs.where({ userId }).delete();

      await buildProgramFromTemplate(userId, template, carried);
    },
  );
}
