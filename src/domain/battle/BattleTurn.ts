export class BattleTurn {
  readonly maximumSummons = 3;
  private summonsUsed = 0;

  get summonsRemaining(): number {
    return this.maximumSummons - this.summonsUsed;
  }

  summon(): void {
    if (this.summonsRemaining <= 0) {
      throw new Error("No summons remaining this turn.");
    }

    this.summonsUsed += 1;
  }
}
