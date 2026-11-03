import type { ReadNight } from './types.js';

// Replaced by issue #2. Here so section 2 can compile against the real import path.
export const readNight: ReadNight = () => {
  throw new Error('readNight: not implemented, see issue #2');
};
