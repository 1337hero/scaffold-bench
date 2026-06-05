// A tiny optimistic "like" store. `toggleLike` should optimistically flip the
// liked state + count, call the server, and ROLL BACK to the prior snapshot if
// the request rejects. Today it applies the optimistic update but never reverts
// on failure, so a failed request leaves the UI showing a like that didn't
// persist.
export type LikeState = { liked: boolean; count: number };

export type SaveLike = (liked: boolean) => Promise<void>;

export function createLikeStore(initial: LikeState, save: SaveLike) {
  let state: LikeState = { ...initial };

  return {
    get(): LikeState {
      return { ...state };
    },
    async toggleLike(): Promise<void> {
      const next = state.liked
        ? { liked: false, count: state.count - 1 }
        : { liked: true, count: state.count + 1 };
      state = next;
      await save(next.liked);
    },
  };
}
