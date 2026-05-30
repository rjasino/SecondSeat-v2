export { connectDB } from "./connect";

// Existing models (canonical definitions — consuming apps re-export from here)
export { UserModel, type IUser } from "./models/user.model";
export { RagSourceModel, type IRagSource } from "./models/rag-source.model";
export {
  RagDocumentModel,
  type IRagDocument,
} from "./models/rag-document.model";
export {
  RagIngestionJobModel,
  type IRagIngestionJob,
} from "./models/rag-ingestion-job.model";

// Inference models
export { GameModel, type IGame } from "./models/game.model";
export {
  ProfileModel,
  type IProfile,
  type Playstyle,
  type HintPhilosophy,
  type SpoilerTolerance,
} from "./models/profile.model";
export {
  PreferencesModel,
  type IPreferences,
} from "./models/preferences.model";
export {
  PlaySessionModel,
  type IPlaySession,
} from "./models/play-session.model";
export {
  RunContextModel,
  type IRunContext,
  type PlayerGoal,
  type ConfidenceLevel,
} from "./models/run-context.model";
export {
  HintRequestModel,
  type IHintRequest,
} from "./models/hint-request.model";
export {
  HintResponseModel,
  type IHintResponse,
  type HintOutcome,
  type RefusalReason,
} from "./models/hint-response.model";
