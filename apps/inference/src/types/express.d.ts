// Module augmentation placeholder. Add fields like `req.user` here as auth lands.
import 'express';

declare module 'express-serve-static-core' {
  // intentionally empty for now
  interface Request {}
}
