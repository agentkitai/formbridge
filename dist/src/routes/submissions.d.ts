import type { Request, Response, NextFunction } from "express";
import type { SubmissionManager } from "../core/submission-manager";
export declare function createSubmissionRoutes(manager: SubmissionManager): {
    generateHandoff(req: Request, res: Response, next: NextFunction): Promise<void>;
    getByResumeToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    emitResumed(req: Request, res: Response, next: NextFunction): Promise<void>;
};
export declare function createSubmissionRouter(manager: SubmissionManager): {
    generateHandoff(req: Request, res: Response, next: NextFunction): Promise<void>;
    getByResumeToken(req: Request, res: Response, next: NextFunction): Promise<void>;
    emitResumed(req: Request, res: Response, next: NextFunction): Promise<void>;
};
//# sourceMappingURL=submissions.d.ts.map