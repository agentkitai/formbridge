/**
 * Tests for FileField component
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileField } from './FileField';
import { FieldMetadata } from '../../types';

// Helper to create metadata
const createMetadata = (overrides: Partial<FieldMetadata> = {}): FieldMetadata => ({
  path: 'testField',
  type: 'file',
  label: 'Test File Field',
  required: false,
  schema: { type: 'file' },
  ...overrides,
});

// Helper to create a mock File object
const createMockFile = (
  name: string,
  size: number,
  type: string,
  lastModified: number = Date.now()
): File => {
  const file = new File(['content'], name, { type, lastModified });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('FileField', () => {
  let mockOnChange: ReturnType<typeof vi.fn>;
  let mockOnBlur: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnChange = vi.fn();
    mockOnBlur = vi.fn();
    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders file field with label', () => {
      const metadata = createMetadata({ label: 'Upload Document' });
      render(
        <FileField
          path="document"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Upload Document')).toBeInTheDocument();
    });

    it('renders drop zone with correct text', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/Click to browse/)).toBeInTheDocument();
      expect(screen.getByText(/or drag and drop/)).toBeInTheDocument();
    });

    it('renders constraint hints when provided', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          maxSize={5 * 1024 * 1024}
          allowedTypes={['image/png', 'image/jpeg']}
          maxCount={3}
        />
      );

      expect(screen.getByText(/Max size: 5 MB/)).toBeInTheDocument();
      expect(screen.getByText(/Allowed types: image\/png, image\/jpeg/)).toBeInTheDocument();
      expect(screen.getByText(/Max files: 3/)).toBeInTheDocument();
    });
  });

  describe('File Selection', () => {
    it('calls onChange when file is selected', () => {
      const metadata = createMetadata();
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.pdf', 1024, 'application/pdf');

      fireEvent.change(input, {
        target: { files: [file] },
      });

      expect(mockOnChange).toHaveBeenCalledWith(file);
    });

    it('handles multiple files when multiple is true', () => {
      const metadata = createMetadata();
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          multiple={true}
        />
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file1 = createMockFile('test1.pdf', 1024, 'application/pdf');
      const file2 = createMockFile('test2.pdf', 2048, 'application/pdf');

      fireEvent.change(input, {
        target: { files: [file1, file2] },
      });

      expect(mockOnChange).toHaveBeenCalledWith([file1, file2]);
    });
  });

  describe('File Validation', () => {
    it('validates file size', () => {
      const metadata = createMetadata();
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          maxSize={1024}
        />
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('large.pdf', 2048, 'application/pdf');

      fireEvent.change(input, {
        target: { files: [file] },
      });

      expect(mockOnChange).not.toHaveBeenCalled();
      expect(screen.getByText(/File size exceeds maximum allowed size/)).toBeInTheDocument();
    });

    it('validates file type', () => {
      const metadata = createMetadata();
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          allowedTypes={['image/png', 'image/jpeg']}
        />
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = createMockFile('test.pdf', 1024, 'application/pdf');

      fireEvent.change(input, {
        target: { files: [file] },
      });

      expect(mockOnChange).not.toHaveBeenCalled();
      expect(screen.getByText(/File type "application\/pdf" is not allowed/)).toBeInTheDocument();
    });

    it('validates max file count', () => {
      const metadata = createMetadata();
      const existingFile = createMockFile('existing.pdf', 1024, 'application/pdf');
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={[existingFile]}
          onChange={mockOnChange}
          multiple={true}
          maxCount={2}
        />
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file1 = createMockFile('test1.pdf', 1024, 'application/pdf');
      const file2 = createMockFile('test2.pdf', 1024, 'application/pdf');

      fireEvent.change(input, {
        target: { files: [file1, file2] },
      });

      expect(mockOnChange).not.toHaveBeenCalled();
      expect(screen.getByText(/Maximum 2 file\(s\) allowed/)).toBeInTheDocument();
    });
  });

  describe('File List Display', () => {
    it('displays selected files', () => {
      const metadata = createMetadata();
      const file = createMockFile('test.pdf', 1024, 'application/pdf');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={file}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText('1 KB')).toBeInTheDocument();
    });

    it('displays multiple files', () => {
      const metadata = createMetadata();
      const file1 = createMockFile('test1.pdf', 1024, 'application/pdf');
      const file2 = createMockFile('test2.pdf', 2048, 'application/pdf');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={[file1, file2]}
          onChange={mockOnChange}
          multiple={true}
        />
      );

      expect(screen.getByText('test1.pdf')).toBeInTheDocument();
      expect(screen.getByText('test2.pdf')).toBeInTheDocument();
    });

    it('allows removing files', () => {
      const metadata = createMetadata();
      const file1 = createMockFile('test1.pdf', 1024, 'application/pdf');
      const file2 = createMockFile('test2.pdf', 2048, 'application/pdf');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={[file1, file2]}
          onChange={mockOnChange}
          multiple={true}
        />
      );

      const removeButtons = screen.getAllByLabelText(/Remove/);
      fireEvent.click(removeButtons[0]);

      expect(mockOnChange).toHaveBeenCalledWith([file2]);
    });

    it('sets value to null when removing the last file', () => {
      const metadata = createMetadata();
      const file = createMockFile('test.pdf', 1024, 'application/pdf');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={file}
          onChange={mockOnChange}
        />
      );

      const removeButton = screen.getByLabelText('Remove test.pdf');
      fireEvent.click(removeButton);

      expect(mockOnChange).toHaveBeenCalledWith(null);
    });
  });

  describe('Image Previews', () => {
    it('generates preview for image files', async () => {
      const metadata = createMetadata();
      const imageFile = createMockFile('image.png', 1024, 'image/png');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={imageFile}
          onChange={mockOnChange}
        />
      );

      await waitFor(() => {
        const preview = screen.getByAltText('Preview of image.png');
        expect(preview).toBeInTheDocument();
        expect(preview).toHaveAttribute('src', 'blob:mock-url');
      });

      expect(global.URL.createObjectURL).toHaveBeenCalledWith(imageFile);
    });

    it('does not generate preview for non-image files', () => {
      const metadata = createMetadata();
      const pdfFile = createMockFile('document.pdf', 1024, 'application/pdf');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={pdfFile}
          onChange={mockOnChange}
        />
      );

      expect(screen.queryByAltText(/Preview of/)).not.toBeInTheDocument();
    });

    it('cleans up preview URLs on unmount', async () => {
      const metadata = createMetadata();
      const imageFile = createMockFile('image.png', 1024, 'image/png');

      const { unmount } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={imageFile}
          onChange={mockOnChange}
        />
      );

      await waitFor(() => {
        expect(global.URL.createObjectURL).toHaveBeenCalled();
      });

      unmount();

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('Upload Progress', () => {
    it('displays progress for uploading files', async () => {
      const metadata = createMetadata();
      const file = createMockFile('test.pdf', 1024, 'application/pdf');

      render(
        <FileField
          path="files"
          metadata={metadata}
          value={file}
          onChange={mockOnChange}
        />
      );

      // Progress should not be shown for completed uploads
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Drag and Drop', () => {
    it('handles drag enter', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      const dropzone = screen.getByTestId('field-files-dropzone');
      fireEvent.dragEnter(dropzone);

      expect(screen.getByText('Drop files here')).toBeInTheDocument();
    });

    it('handles drag leave', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      const dropzone = screen.getByTestId('field-files-dropzone');
      fireEvent.dragEnter(dropzone);
      fireEvent.dragLeave(dropzone);

      expect(screen.getByText(/Click to browse/)).toBeInTheDocument();
    });

    it('handles file drop', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      const dropzone = screen.getByTestId('field-files-dropzone');
      const file = createMockFile('dropped.pdf', 1024, 'application/pdf');

      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [file],
        },
      });

      expect(mockOnChange).toHaveBeenCalledWith(file);
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      const metadata = createMetadata({ label: 'Upload Document' });
      render(
        <FileField
          path="document"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      const dropzone = screen.getByRole('button');
      expect(dropzone).toHaveAttribute(
        'aria-label',
        'Upload Document - Click or drag files to upload'
      );
    });

    it('is keyboard accessible', () => {
      const metadata = createMetadata();
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
        />
      );

      const dropzone = screen.getByRole('button');
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;

      // Mock input click
      const inputClick = vi.spyOn(input, 'click');

      fireEvent.keyDown(dropzone, { key: 'Enter' });
      expect(inputClick).toHaveBeenCalled();
    });

    it('calls onBlur when field loses focus', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          onBlur={mockOnBlur}
        />
      );

      const dropzone = screen.getByRole('button');
      fireEvent.blur(dropzone);

      expect(mockOnBlur).toHaveBeenCalled();
    });
  });

  describe('Disabled State', () => {
    it('disables interactions when disabled', () => {
      const metadata = createMetadata();
      const { container } = render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).toBeDisabled();

      const dropzone = screen.getByRole('button');
      expect(dropzone).toHaveAttribute('tabIndex', '-1');
    });

    it('does not handle drag when disabled', () => {
      const metadata = createMetadata();
      render(
        <FileField
          path="files"
          metadata={metadata}
          value={null}
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const dropzone = screen.getByTestId('field-files-dropzone');
      fireEvent.dragEnter(dropzone);

      expect(screen.queryByText('Drop files here')).not.toBeInTheDocument();
    });
  });
});
