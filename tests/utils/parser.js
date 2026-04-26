export const allColumns = [
  "Place",
  "Name",
  "Sex",
  "Event",
  "Division",
  "WeightClassKg",
  "Equipment",
  "BirthDate",
  "BirthYear",
  "BodyweightKg",
  "Squat1Kg",
  "Squat2Kg",
  "Squat3Kg",
  "Best3SquatKg",
  "Bench1Kg",
  "Bench2Kg",
  "Bench3Kg",
  "Best3BenchKg",
  "Deadlift1Kg",
  "Deadlift2Kg",
  "Deadlift3Kg",
  "Best3DeadliftKg",
  "TotalKg",
];

export const benchOnlyColumns = allColumns.filter(
  (c) =>
    ![
      "Squat1Kg",
      "Squat2Kg",
      "Squat3Kg",
      "Best3SquatKg",
      "Deadlift1Kg",
      "Deadlift2Kg",
      "Deadlift3Kg",
      "Best3DeadliftKg",
    ].includes(c),
);

export const deadliftOnlyColumns = allColumns.filter(
  (c) =>
    ![
      "Squat1Kg",
      "Squat2Kg",
      "Squat3Kg",
      "Best3SquatKg",
      "Bench1Kg",
      "Bench2Kg",
      "Bench3Kg",
      "Best3BenchKg",
    ].includes(c),
);
