/**
 * Tests for ActorBadge component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ActorBadge } from '../ActorBadge';
import type { Actor } from '../../types';

describe('ActorBadge', () => {
  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent-123',
    name: 'AutoVendor',
  };

  const humanActor: Actor = {
    kind: 'human',
    id: 'user-456',
    name: 'John Doe',
  };

  const systemActor: Actor = {
    kind: 'system',
    id: 'sys-001',
  };

  describe('rendering', () => {
    it('should render agent badge with default props', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Filled by agent (AutoVendor)');
    });

    it('should render human badge', () => {
      render(<ActorBadge actor={humanActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Filled by human (John Doe)');
    });

    it('should render system badge', () => {
      render(<ActorBadge actor={systemActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Filled by system');
    });

    it('should render without actor name when showName is false', () => {
      render(<ActorBadge actor={agentActor} showName={false} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Filled by agent');
      expect(badge).not.toHaveTextContent('AutoVendor');
    });

    it('should render without name when actor has no name', () => {
      const noNameActor: Actor = {
        kind: 'agent',
        id: 'agent-999',
      };

      render(<ActorBadge actor={noNameActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Filled by agent');
      expect(badge).not.toHaveTextContent('(');
    });
  });

  describe('custom props', () => {
    it('should render with custom prefix', () => {
      render(<ActorBadge actor={agentActor} prefix="Created by" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Created by agent');
    });

    it('should render without prefix when prefix is empty', () => {
      render(<ActorBadge actor={agentActor} prefix="" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('agent (AutoVendor)');
      expect(badge).not.toHaveTextContent('Filled by');
    });

    it('should apply custom className', () => {
      render(<ActorBadge actor={agentActor} className="custom-class" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('custom-class');
    });

    it('should apply small size class', () => {
      render(<ActorBadge actor={agentActor} size="small" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge--small');
    });

    it('should apply medium size class by default', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge--medium');
    });

    it('should apply large size class', () => {
      render(<ActorBadge actor={agentActor} size="large" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge--large');
    });
  });

  describe('CSS classes', () => {
    it('should have base formbridge-actor-badge class', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge');
    });

    it('should have actor kind specific class for agent', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge--agent');
    });

    it('should have actor kind specific class for human', () => {
      render(<ActorBadge actor={humanActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge--human');
    });

    it('should have actor kind specific class for system', () => {
      render(<ActorBadge actor={systemActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveClass('formbridge-actor-badge--system');
    });
  });

  describe('data attributes', () => {
    it('should set data-actor-kind attribute', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('data-actor-kind', 'agent');
    });

    it('should set data-actor-id attribute', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('data-actor-id', 'agent-123');
    });
  });

  describe('accessibility', () => {
    it('should have aria-label with actor kind and name', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('aria-label', 'Filled by agent: AutoVendor');
    });

    it('should have aria-label with actor kind only when no name', () => {
      render(<ActorBadge actor={systemActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('aria-label', 'Filled by system');
    });

    it('should have aria-label with custom prefix', () => {
      render(<ActorBadge actor={humanActor} prefix="Updated by" />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('aria-label', 'Updated by human: John Doe');
    });

    it('should have role="status" for screen readers', () => {
      render(<ActorBadge actor={agentActor} />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('role', 'status');
    });
  });

  describe('component structure', () => {
    it('should render prefix in separate span', () => {
      const { container } = render(<ActorBadge actor={agentActor} />);

      const prefixSpan = container.querySelector('.formbridge-actor-badge__prefix');
      expect(prefixSpan).toBeInTheDocument();
      expect(prefixSpan).toHaveTextContent('Filled by');
    });

    it('should render actor kind in separate span', () => {
      const { container } = render(<ActorBadge actor={agentActor} />);

      const kindSpan = container.querySelector('.formbridge-actor-badge__kind');
      expect(kindSpan).toBeInTheDocument();
      expect(kindSpan).toHaveTextContent('agent');
    });

    it('should render actor name in separate span when showName is true', () => {
      const { container } = render(<ActorBadge actor={agentActor} showName />);

      const nameSpan = container.querySelector('.formbridge-actor-badge__name');
      expect(nameSpan).toBeInTheDocument();
      expect(nameSpan).toHaveTextContent('(AutoVendor)');
    });

    it('should not render name span when showName is false', () => {
      const { container } = render(<ActorBadge actor={agentActor} showName={false} />);

      const nameSpan = container.querySelector('.formbridge-actor-badge__name');
      expect(nameSpan).not.toBeInTheDocument();
    });

    it('should not render name span when actor has no name', () => {
      const { container } = render(<ActorBadge actor={systemActor} showName />);

      const nameSpan = container.querySelector('.formbridge-actor-badge__name');
      expect(nameSpan).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle actor with metadata', () => {
      const actorWithMetadata: Actor = {
        kind: 'agent',
        id: 'agent-999',
        name: 'TestAgent',
        metadata: { version: '1.0', source: 'api' },
      };

      render(<ActorBadge actor={actorWithMetadata} />);

      const badge = screen.getByRole('status');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Filled by agent (TestAgent)');
    });

    it('should handle empty string name gracefully', () => {
      const actorWithEmptyName: Actor = {
        kind: 'human',
        id: 'user-000',
        name: '',
      };

      render(<ActorBadge actor={actorWithEmptyName} showName />);

      const badge = screen.getByRole('status');
      expect(badge).toHaveTextContent('Filled by human');
    });
  });
});
