import type { Request, Response, NextFunction } from "express";
import type { SubmissionManager } from "../core/submission-manager";
export declare function createEventRoutes(manager: SubmissionManager): {
    getEvents(req: Request, res: Response, next: NextFunction): Promise<void>;
};
export declare function createEventRouter(manager: SubmissionManager): {
    getEvents(req: Request, res: Response, next: NextFunction): Promise<void>;
};
//# sourceMappingURL=events.d.ts.map