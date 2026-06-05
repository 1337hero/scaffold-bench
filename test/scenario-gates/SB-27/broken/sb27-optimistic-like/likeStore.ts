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
      try {
        await save(next.liked);
      } catch (e) {
        // revert the flag on failure
        console.log("save failed, reverting", e);
        state = { ...state, liked: !state.liked };
      }
    },
  };
}
