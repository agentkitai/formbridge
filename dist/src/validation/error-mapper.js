import { z } from 'zod';
export function mapToIntakeError(zodError, options) {
    const fieldErrors = [];
    const missingFields = [];
    const invalidFields = [];
    for (const issue of zodError.issues) {
        const fieldPath = getFieldPath(issue.path);
        const errorType = determineErrorType(issue);
        const fieldError = {
            field: fieldPath,
            message: issue.message,
            type: errorType,
            constraint: getConstraint(issue),
            value: options?.includeValues ? getIssueValue(issue) : undefined
        };
        fieldErrors.push(fieldError);
        if (errorType === 'missing') {
            missingFields.push(fieldPath);
        }
        else if (errorType === 'invalid') {
            invalidFields.push(fieldPath);
        }
    }
    const overallType = missingFields.length > 0 ? 'missing' : 'invalid';
    const message = generateErrorMessage(fieldErrors, overallType);
    const nextActions = generateNextActions(missingFields, invalidFields, fieldErrors);
    return {
        type: overallType,
        message,
        fields: fieldErrors,
        nextActions,
        resumeToken: options?.resumeToken,
        idempotencyKey: options?.idempotencyKey,
        timestamp: options?.includeTimestamp ? new Date().toISOString() : undefined
    };
}
function getFieldPath(path) {
    if (path.length === 0) {
        return 'root';
    }
    return path.join('.');
}
function determineErrorType(issue) {
    if (issue.code === 'invalid_type') {
        const typeIssue = issue;
        if (typeIssue.received === 'undefined' || typeIssue.received === 'null') {
            return 'missing';
        }
    }
    if (issue.code === 'custom') {
        const customIssue = issue;
        if (customIssue.params?.errorType === 'conflict') {
            return 'conflict';
        }
        if (customIssue.params?.errorType === 'needs_approval') {
            return 'needs_approval';
        }
    }
    return 'invalid';
}
function getConstraint(issue) {
    switch (issue.code) {
        case 'too_small':
            return `min:${issue.minimum}`;
        case 'too_big':
            return `max:${issue.maximum}`;
        case 'invalid_string':
            return issue.validation === 'email' ? 'email' :
                issue.validation === 'url' ? 'url' :
                    issue.validation === 'uuid' ? 'uuid' :
                        String(issue.validation);
        case 'invalid_type':
            return `type:${issue.expected}`;
        case 'invalid_enum_value':
            return 'enum';
        case 'invalid_literal':
            return 'literal';
        default:
            return undefined;
    }
}
function getIssueValue(issue) {
    if ('received' in issue) {
        return issue.received;
    }
    return undefined;
}
function generateErrorMessage(fieldErrors, overallType) {
    const count = fieldErrors.length;
    const fieldWord = count === 1 ? 'field' : 'fields';
    if (overallType === 'missing') {
        const missingCount = fieldErrors.filter(e => e.type === 'missing').length;
        if (missingCount === count) {
            return `${missingCount} required ${fieldWord} ${missingCount === 1 ? 'is' : 'are'} missing`;
        }
        return `Validation failed: ${missingCount} required ${fieldWord} missing, ${count - missingCount} ${fieldWord} invalid`;
    }
    return `Validation failed for ${count} ${fieldWord}`;
}
function generateNextActions(missingFields, invalidFields, allErrors) {
    const actions = [];
    if (missingFields.length > 0) {
        actions.push({
            type: 'provide_missing_fields',
            description: `Provide values for ${missingFields.length} required ${missingFields.length === 1 ? 'field' : 'fields'}`,
            fields: missingFields
        });
    }
    if (invalidFields.length > 0) {
        actions.push({
            type: 'correct_invalid_fields',
            description: `Correct values for ${invalidFields.length} invalid ${invalidFields.length === 1 ? 'field' : 'fields'}`,
            fields: invalidFields
        });
    }
    const emailErrors = allErrors.filter(e => e.constraint === 'email');
    if (emailErrors.length > 0) {
        actions.push({
            type: 'fix_email_format',
            description: 'Provide valid email addresses',
            fields: emailErrors.map(e => e.field)
        });
    }
    const minErrors = allErrors.filter(e => e.constraint?.startsWith('min:'));
    if (minErrors.length > 0) {
        actions.push({
            type: 'meet_minimum_requirements',
            description: 'Ensure values meet minimum requirements',
            fields: minErrors.map(e => e.field),
            params: {
                constraints: minErrors.map(e => ({ field: e.field, constraint: e.constraint }))
            }
        });
    }
    if (actions.length === 0) {
        actions.push({
            type: 'fix_validation_errors',
            description: 'Correct all validation errors and resubmit',
            fields: allErrors.map(e => e.field)
        });
    }
    return actions;
}
export function mapMultipleToIntakeError(zodErrors, options) {
    const allIssues = zodErrors.flatMap(err => err.issues);
    const combinedError = new z.ZodError(allIssues);
    return mapToIntakeError(combinedError, options);
}
//# sourceMappingURL=error-mapper.js.map