// Existing models (canonical definitions — consuming apps re-export from here)
export { UserModel, type IUser } from "./models/user.model.js";
export { RagSourceModel, type IRagSource } from "./models/rag-source.model.js";
export { RagDocumentModel, type IRagDocument } from "./models/rag-document.model.js";
export { RagIngestionJobModel, type IRagIngestionJob } from "./models/rag-ingestion-job.model.js";

// Inference models
export { GameModel, type IGame } from "./models/game.model.js";
export { ProfileModel, type IProfile, type Playstyle, type HintPhilosophy, type SpoilerTolerance } from "./models/profile.model.js";
export { PreferencesModel, type IPreferences } from "./models/preferences.model.js";
export { PlaySessionModel, type IPlaySession } from "./models/play-session.model.js";
export { RunContextModel, type IRunContext, type PlayerGoal, type ConfidenceLevel } from "./models/run-context.model.js";
export { HintRequestModel, type IHintRequest } from "./models/hint-request.model.js";
export { HintResponseModel, type IHintResponse, type RefusalReason } from "./models/hint-response.model.js";
