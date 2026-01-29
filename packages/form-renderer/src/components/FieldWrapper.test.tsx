/**
 * Tests for FieldWrapper component
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FieldWrapper } from './FieldWrapper';

describe('FieldWrapper', () => {
  it('renders with label and input', () => {
    render(
      <FieldWrapper path="email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('generates correct field ID from path', () => {
    render(
      <FieldWrapper path="user.email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'field-user.email');
  });

  it('links label to input with htmlFor', () => {
    render(
      <FieldWrapper path="email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    const label = screen.getByText('Email');
    const input = screen.getByRole('textbox');

    expect(label).toHaveAttribute('for', 'field-email');
    expect(input).toHaveAttribute('id', 'field-email');
  });

  it('displays required indicator when required=true', () => {
    render(
      <FieldWrapper path="email" label="Email" required={true}>
        <input type="text" />
      </FieldWrapper>
    );

    const requiredIndicator = screen.getByLabelText('required');
    expect(requiredIndicator).toBeInTheDocument();
    expect(requiredIndicator).toHaveTextContent('*');
  });

  it('does not display required indicator when required=false', () => {
    render(
      <FieldWrapper path="email" label="Email" required={false}>
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.queryByLabelText('required')).not.toBeInTheDocument();
  });

  it('displays description when provided', () => {
    render(
      <FieldWrapper
        path="email"
        label="Email"
        description="Enter your email address"
      >
        <input type="text" />
      </FieldWrapper>
    );

    expect(screen.getByText('Enter your email address')).toBeInTheDocument();
  });

  it('links description to input with aria-describedby', () => {
    render(
      <FieldWrapper
        path="email"
        label="Email"
        description="Enter your email address"
      >
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'field-email-description');

    const description = screen.getByText('Enter your email address');
    expect(description).toHaveAttribute('id', 'field-email-description');
  });

  it('displays error message when provided', () => {
    render(
      <FieldWrapper path="email" label="Email" error="Email is required">
        <input type="text" />
      </FieldWrapper>
    );

    const errorMessage = screen.getByText('Email is required');
    expect(errorMessage).toBeInTheDocument();
    expect(errorMessage).toHaveAttribute('role', 'alert');
  });

  it('sets aria-invalid when error is present', () => {
    render(
      <FieldWrapper path="email" label="Email" error="Email is required">
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('links error to input with aria-describedby', () => {
    render(
      <FieldWrapper path="email" label="Email" error="Email is required">
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'field-email-error');

    const error = screen.getByText('Email is required');
    expect(error).toHaveAttribute('id', 'field-email-error');
  });

  it('links both description and error to input when both are provided', () => {
    render(
      <FieldWrapper
        path="email"
        label="Email"
        description="Enter your email address"
        error="Email is required"
      >
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'field-email-description field-email-error'
    );
  });

  it('applies custom className', () => {
    const { container } = render(
      <FieldWrapper path="email" label="Email" className="custom-class">
        <input type="text" />
      </FieldWrapper>
    );

    const fieldWrapper = container.querySelector('.formbridge-field');
    expect(fieldWrapper).toHaveClass('custom-class');
  });

  it('applies default formbridge-field class', () => {
    const { container } = render(
      <FieldWrapper path="email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    const fieldWrapper = container.querySelector('.formbridge-field');
    expect(fieldWrapper).toBeInTheDocument();
  });

  it('sets data-field-path attribute', () => {
    const { container } = render(
      <FieldWrapper path="user.email" label="Email">
        <input type="text" />
      </FieldWrapper>
    );

    const fieldWrapper = container.querySelector('.formbridge-field');
    expect(fieldWrapper).toHaveAttribute('data-field-path', 'user.email');
  });

  it('sets aria-required when required=true', () => {
    render(
      <FieldWrapper path="email" label="Email" required={true}>
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('sets aria-required to false when required=false', () => {
    render(
      <FieldWrapper path="email" label="Email" required={false}>
        <input type="text" />
      </FieldWrapper>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-required', 'false');
  });

  it('handles multiple children correctly', () => {
    render(
      <FieldWrapper path="range" label="Range">
        <input type="number" aria-label="min" />
        <input type="number" aria-label="max" />
      </FieldWrapper>
    );

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(2);

    // Both inputs should get the same ID (first child gets it)
    expect(inputs[0]).toHaveAttribute('id', 'field-range');
  });

  it('handles non-element children gracefully', () => {
    render(
      <FieldWrapper path="test" label="Test">
        Some text content
      </FieldWrapper>
    );

    expect(screen.getByText('Some text content')).toBeInTheDocument();
  });

  it('applies correct CSS classes to all elements', () => {
    const { container } = render(
      <FieldWrapper
        path="email"
        label="Email"
        description="Test description"
        error="Test error"
      >
        <input type="text" />
      </FieldWrapper>
    );

    expect(container.querySelector('.formbridge-field')).toBeInTheDocument();
    expect(container.querySelector('.formbridge-field__label')).toBeInTheDocument();
    expect(container.querySelector('.formbridge-field__description')).toBeInTheDocument();
    expect(container.querySelector('.formbridge-field__input')).toBeInTheDocument();
    expect(container.querySelector('.formbridge-field__error')).toBeInTheDocument();
  });

  it('error has aria-live="polite" for screen readers', () => {
    render(
      <FieldWrapper path="email" label="Email" error="Test error">
        <input type="text" />
      </FieldWrapper>
    );

    const error = screen.getByRole('alert');
    expect(error).toHaveAttribute('aria-live', 'polite');
  });
});
