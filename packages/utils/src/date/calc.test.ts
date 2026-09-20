import { expect, test } from "vite-plus/test";
import {
  addDays,
  addMonths,
  addYears,
  diffInDays,
  endOfDay,
  isSameDay,
  startOfDay,
} from "./calc.ts";

test("addDays / addMonths / addYears shift the date without mutating the input", () => {
  const date = new Date(2026, 0, 31);

  expect(addDays(date, 1)).toEqual(new Date(2026, 1, 1));
  expect(addMonths(date, 1)).toEqual(new Date(2026, 2, 3));
  expect(addYears(date, 1)).toEqual(new Date(2027, 0, 31));
  expect(date).toEqual(new Date(2026, 0, 31));
});

test("startOfDay / endOfDay clamp the time portion", () => {
  const date = new Date(2026, 5, 15, 13, 45, 30);

  expect(startOfDay(date)).toEqual(new Date(2026, 5, 15, 0, 0, 0, 0));
  expect(endOfDay(date)).toEqual(new Date(2026, 5, 15, 23, 59, 59, 999));
});

test("isSameDay compares calendar date only", () => {
  expect(isSameDay(new Date(2026, 5, 15, 1), new Date(2026, 5, 15, 23))).toBe(true);
  expect(isSameDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false);
});

test("diffInDays counts calendar days between two dates", () => {
  expect(diffInDays(new Date(2026, 5, 20), new Date(2026, 5, 15))).toBe(5);
  expect(diffInDays(new Date(2026, 5, 15), new Date(2026, 5, 20))).toBe(-5);
});
