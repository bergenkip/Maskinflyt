// React resets a form after its action finishes. A controlled radio is then put
// back to the choice it had when it first appeared, while React's state still
// holds the new choice: the screen and the next submit disagree. Counting each
// answer lets a form give its radios a new key, so they appear again with the
// current choice.
export type Counted<S> = S & { round?: number };

export function counted<S extends object, P>(action: (state: S, payload: P) => Promise<S>) {
  return async (state: Counted<S>, payload: P): Promise<Counted<S>> => ({
    ...(await action(state, payload)),
    round: (state.round ?? 0) + 1,
  });
}
