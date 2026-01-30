/**
 * ActorBadge component - Displays visual badge for actor attribution
 * Shows which actor (agent, human, system) performed an action or filled a field
 */

import React from 'react';
import type { Actor } from '../types';

/**
 * Props for ActorBadge component
 */
export interface ActorBadgeProps {
  /** Actor who performed the action */
  actor: Actor;
  /** Custom CSS class */
  className?: string;
  /** Additional prefix text before actor kind (e.g., "Filled by") */
  prefix?: string;
  /** Whether to show the actor's name */
  showName?: boolean;
  /** Size variant of the badge */
  size?: 'small' | 'medium' | 'large';
}

/**
 * ActorBadge - Component that displays a visual badge for actor attribution
 *
 * This component provides a consistent visual indicator showing which actor
 * (agent, human, system) performed an action in mixed-mode agent-human
 * collaboration workflows. Used to distinguish agent-filled fields from
 * human-filled fields in forms.
 *
 * @example
 * ```tsx
 * // Basic usage with agent
 * <ActorBadge
 *   actor={{ kind: "agent", id: "agent_123", name: "AutoVendor" }}
 * />
 *
 * // With custom prefix
 * <ActorBadge
 *   actor={{ kind: "human", id: "user_456", name: "John Doe" }}
 *   prefix="Filled by"
 * />
 *
 * // Show actor name
 * <ActorBadge
 *   actor={{ kind: "agent", id: "agent_123", name: "AutoVendor" }}
 *   showName
 * />
 *
 * // Different sizes
 * <ActorBadge
 *   actor={{ kind: "system", id: "sys_001" }}
 *   size="small"
 * />
 * ```
 */
export const ActorBadge: React.FC<ActorBadgeProps> = ({
  actor,
  className = '',
  prefix = 'Filled by',
  showName = true,
  size = 'medium',
}) => {
  // Generate ARIA label for accessibility
  const ariaLabel = `${prefix} ${actor.kind}${actor.name ? `: ${actor.name}` : ''}`;

  // Build CSS class list
  const cssClasses = [
    'formbridge-actor-badge',
    `formbridge-actor-badge--${actor.kind}`,
    `formbridge-actor-badge--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <span
      className={cssClasses}
      data-actor-kind={actor.kind}
      data-actor-id={actor.id}
      aria-label={ariaLabel}
      role="status"
    >
      {prefix && (
        <span className="formbridge-actor-badge__prefix">
          {prefix}{' '}
        </span>
      )}
      <span className="formbridge-actor-badge__kind">
        {actor.kind}
      </span>
      {showName && actor.name && (
        <span className="formbridge-actor-badge__name">
          {' '}({actor.name})
        </span>
      )}
    </span>
  );
};

ActorBadge.displayName = 'ActorBadge';
