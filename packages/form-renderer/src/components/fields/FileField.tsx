/**
 * FileField component - Renders file input fields with drag-and-drop support
 * Supports file upload constraints (maxSize, allowedTypes, maxCount)
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FileFieldProps } from '../../types';
import { FieldWrapper } from '../FieldWrapper';

/**
 * Formats file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validates a file against constraints
 */
function validateFile(
  file: File,
  maxSize?: number,
  allowedTypes?: string[]
): string | null {
  // Check file size
  if (maxSize && file.size > maxSize) {
    return `File size exceeds maximum allowed size of ${formatFileSize(maxSize)}`;
  }

  // Check MIME type
  if (allowedTypes && allowedTypes.length > 0) {
    const isAllowed = allowedTypes.some((type) => {
      // Support wildcards like "image/*"
      if (type.endsWith('/*')) {
        const prefix = type.slice(0, -2);
        return file.type.startsWith(prefix);
      }
      return file.type === type;
    });

    if (!isAllowed) {
      return `File type "${file.type}" is not allowed. Allowed types: ${allowedTypes.join(', ')}`;
    }
  }

  return null;
}

/**
 * File upload progress state
 */
interface FileProgress {
  /** File being uploaded */
  file: File;
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Upload state */
  state: 'pending' | 'uploading' | 'complete' | 'error';
  /** Error message if state is 'error' */
  error?: string;
}

/**
 * File preview state
 */
interface FilePreview {
  /** File reference */
  file: File;
  /** Preview URL (blob URL for images) */
  url: string;
  /** Whether file is an image */
  isImage: boolean;
}

/**
 * Checks if a file is an image type
 */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * FileField - Renders a file input field with drag-and-drop support
 *
 * Features:
 * - Drag-and-drop file upload area
 * - Click to browse file selection
 * - File size and MIME type validation
 * - Multiple file support
 * - File list display with removal
 * - Upload progress tracking with progress bars
 * - Image preview thumbnails
 * - Full accessibility support
 * - Visual feedback for drag state
 * - Automatic cleanup of preview URLs
 *
 * @example
 * ```tsx
 * <FileField
 *   path="documents"
 *   metadata={{
 *     path: 'documents',
 *     type: 'file',
 *     label: 'Upload Documents',
 *     required: true,
 *     schema: { type: 'file' }
 *   }}
 *   value={null}
 *   onChange={(files) => console.log(files)}
 *   maxSize={5 * 1024 * 1024} // 5MB
 *   allowedTypes={['application/pdf', 'image/*']}
 *   multiple={true}
 *   maxCount={3}
 * />
 * ```
 */
export const FileField: React.FC<FileFieldProps> = ({
  path,
  metadata,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  className = '',
  maxSize,
  allowedTypes,
  maxCount,
  multiple = false,
}) => {
  const { label, description, required, hint } = metadata;
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Map<string, FileProgress>>(new Map());
  const [filePreviews, setFilePreviews] = useState<Map<string, FilePreview>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  // Get current files as array (memoized to prevent infinite re-renders in useEffect)
  const currentFiles: File[] = useMemo(
    () => (value ? (Array.isArray(value) ? value : [value]) : []),
    [value]
  );

  /**
   * Generate a unique key for a file (name + size + lastModified)
   */
  const getFileKey = useCallback((file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }, []);

  /**
   * Generate preview for a file if it's an image
   */
  const generatePreview = useCallback((file: File): FilePreview | null => {
    if (!isImageFile(file)) {
      return null;
    }

    const url = URL.createObjectURL(file);
    return {
      file,
      url,
      isImage: true,
    };
  }, []);

  /**
   * Update file previews when files change
   */
  useEffect(() => {
    const newPreviews = new Map<string, FilePreview>();

    // Generate previews for current files
    currentFiles.forEach((file) => {
      const key = getFileKey(file);
      const existingPreview = filePreviews.get(key);

      if (existingPreview) {
        // Reuse existing preview
        newPreviews.set(key, existingPreview);
      } else {
        // Generate new preview
        const preview = generatePreview(file);
        if (preview) {
          newPreviews.set(key, preview);
        }
      }
    });

    // Clean up old preview URLs that are no longer needed
    filePreviews.forEach((preview, key) => {
      if (!newPreviews.has(key)) {
        URL.revokeObjectURL(preview.url);
      }
    });

    setFilePreviews(newPreviews);

    // Cleanup function to revoke all preview URLs on unmount
    return () => {
      newPreviews.forEach((preview) => {
        URL.revokeObjectURL(preview.url);
      });
    };
  }, [currentFiles, getFileKey, generatePreview]);

  /**
   * Initialize upload progress for new files
   */
  useEffect(() => {
    const newProgress = new Map<string, FileProgress>(uploadProgress);

    // Add progress tracking for new files
    currentFiles.forEach((file) => {
      const key = getFileKey(file);
      if (!newProgress.has(key)) {
        newProgress.set(key, {
          file,
          progress: 100, // Files are considered complete when added (no actual upload yet)
          state: 'complete',
        });
      }
    });

    // Remove progress for files that are no longer in the list
    const currentKeys = new Set(currentFiles.map(getFileKey));
    Array.from(newProgress.keys()).forEach((key) => {
      if (!currentKeys.has(key)) {
        newProgress.delete(key);
      }
    });

    setUploadProgress(newProgress);
  }, [currentFiles, getFileKey]);

  // Handle file selection (from input or drop)
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    const newFiles = Array.from(files);

    // Validate each file
    for (const file of newFiles) {
      const validationResult = validateFile(file, maxSize, allowedTypes);
      if (validationResult) {
        setValidationError(validationResult);
        return;
      }
    }

    // Clear validation error if all files are valid
    setValidationError(null);

    // Check maxCount constraint
    if (maxCount && currentFiles.length + newFiles.length > maxCount) {
      setValidationError(`Maximum ${maxCount} file(s) allowed`);
      return;
    }

    // Update value based on multiple setting
    if (multiple) {
      onChange([...currentFiles, ...newFiles]);
    } else {
      onChange(newFiles[0]);
    }
  };

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input value to allow selecting the same file again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!disabled) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Handle remove file
  const handleRemoveFile = (index: number) => {
    const newFiles = currentFiles.filter((_, i) => i !== index);

    if (newFiles.length === 0) {
      onChange(null);
    } else if (multiple) {
      onChange(newFiles);
    } else {
      onChange(newFiles[0] || null);
    }

    setValidationError(null);
  };

  // Handle click on drop zone
  const handleDropZoneClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  // Handle keyboard events for accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Allow Enter or Space to trigger file selection
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleDropZoneClick();
    }
    // Allow Escape key to blur
    if (e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  // Handle blur event
  const handleBlur = () => {
    if (onBlur) {
      onBlur();
    }
  };

  // Build accept attribute for input
  const accept = allowedTypes?.join(',');

  // Combine errors (validation error takes precedence over external error)
  const displayError = validationError || error;

  // Generate constraint hint text
  const constraints: string[] = [];
  if (maxSize) {
    constraints.push(`Max size: ${formatFileSize(maxSize)}`);
  }
  if (allowedTypes && allowedTypes.length > 0) {
    constraints.push(`Allowed types: ${allowedTypes.join(', ')}`);
  }
  if (maxCount) {
    constraints.push(`Max files: ${maxCount}`);
  }
  const constraintHint = constraints.length > 0 ? constraints.join(' • ') : undefined;

  return (
    <FieldWrapper
      path={path}
      label={label}
      description={description}
      required={required}
      error={displayError}
      className={`formbridge-file-field ${className}`.trim()}
    >
      <div className="formbridge-file-field__container">
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          onChange={handleInputChange}
          disabled={disabled}
          accept={accept}
          multiple={multiple}
          className="formbridge-file-field__input"
          style={{ display: 'none' }}
          data-testid={`field-${path}-input`}
        />

        {/* Drag-and-drop zone */}
        <div
          className={`formbridge-file-field__dropzone ${
            isDragging ? 'formbridge-file-field__dropzone--dragging' : ''
          } ${disabled ? 'formbridge-file-field__dropzone--disabled' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleDropZoneClick}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`${label} - Click or drag files to upload`}
          data-testid={`field-${path}-dropzone`}
        >
          <div className="formbridge-file-field__dropzone-content">
            <svg
              className="formbridge-file-field__dropzone-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="formbridge-file-field__dropzone-text">
              {isDragging ? (
                <strong>Drop files here</strong>
              ) : (
                <>
                  <strong>Click to browse</strong> or drag and drop
                </>
              )}
            </p>
            {constraintHint && (
              <p className="formbridge-file-field__dropzone-hint">
                {constraintHint}
              </p>
            )}
          </div>
        </div>

        {/* File list */}
        {currentFiles.length > 0 && (
          <ul
            className="formbridge-file-field__file-list"
            role="list"
            aria-label="Selected files"
          >
            {currentFiles.map((file, index) => {
              const fileKey = getFileKey(file);
              const preview = filePreviews.get(fileKey);
              const progress = uploadProgress.get(fileKey);

              return (
                <li
                  key={`${file.name}-${index}`}
                  className="formbridge-file-field__file-item"
                  data-testid={`field-${path}-file-${index}`}
                >
                  {/* Preview thumbnail for images */}
                  {preview && preview.isImage && (
                    <div className="formbridge-file-field__file-preview">
                      <img
                        src={preview.url}
                        alt={`Preview of ${file.name}`}
                        className="formbridge-file-field__preview-image"
                        data-testid={`field-${path}-preview-${index}`}
                      />
                    </div>
                  )}

                  <div className="formbridge-file-field__file-content">
                    <div className="formbridge-file-field__file-info">
                      <span className="formbridge-file-field__file-name">
                        {file.name}
                      </span>
                      <span className="formbridge-file-field__file-size">
                        {formatFileSize(file.size)}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {progress && progress.state !== 'complete' && (
                      <div className="formbridge-file-field__progress-container">
                        <div
                          className={`formbridge-file-field__progress-bar ${
                            progress.state === 'error'
                              ? 'formbridge-file-field__progress-bar--error'
                              : ''
                          }`}
                          role="progressbar"
                          aria-valuenow={progress.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Upload progress for ${file.name}`}
                          data-testid={`field-${path}-progress-${index}`}
                        >
                          <div
                            className="formbridge-file-field__progress-fill"
                            style={{ width: `${progress.progress}%` }}
                          />
                        </div>
                        {progress.state === 'uploading' && (
                          <span className="formbridge-file-field__progress-text">
                            {progress.progress}%
                          </span>
                        )}
                        {progress.state === 'error' && progress.error && (
                          <span className="formbridge-file-field__progress-error">
                            {progress.error}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    disabled={disabled}
                    className="formbridge-file-field__remove-button"
                    aria-label={`Remove ${file.name}`}
                    data-testid={`field-${path}-remove-${index}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FieldWrapper>
  );
};

FileField.displayName = 'FileField';
