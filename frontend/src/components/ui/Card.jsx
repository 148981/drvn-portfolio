import React, { memo } from 'react';
import './Card.css';

/**
 * Standard Card Component
 * 
 * Variants:
 * - base: Default glass style
 * - elevated: More prominent elevation
 * - flat: Minimal border, no shadow
 * 
 * Padding:
 * - none, sm, md, lg, xl
 */
const Card = ({
    children,
    variant = 'base',
    padding = 'md',
    className = '',
    onClick,
    ...props
}) => {
    const baseClass = 'ui-card';
    const variantClass = `card-${variant}`;
    const paddingClass = `card-padding-${padding}`;
    const clickableClass = onClick ? 'card-clickable' : '';

    const combinedClassName = `${baseClass} ${variantClass} ${paddingClass} ${clickableClass} ${className}`.trim();

    return (
        <div
            className={combinedClassName}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            {...props}
        >
            {children}
        </div>
    );
};

// Sub-components for structured content
Card.Header = ({ children, className = '' }) => (
    <div className={`card-header ${className}`}>
        {children}
    </div>
);

Card.Title = ({ children, icon: Icon, className = '' }) => (
    <h3 className={`card-title ${className}`}>
        {Icon && <Icon className="card-title-icon" size={20} />}
        {children}
    </h3>
);

Card.Content = ({ children, className = '' }) => (
    <div className={`card-content ${className}`}>
        {children}
    </div>
);

Card.Footer = ({ children, className = '' }) => (
    <div className={`card-footer ${className}`}>
        {children}
    </div>
);


// 🟢 P2-2: memo 基礎 Card；子元件（Header/Title/Content/Footer）重新掛回 memo 版本，保留原 API
const MemoCard = memo(Card);
MemoCard.Header = Card.Header;
MemoCard.Title = Card.Title;
MemoCard.Content = Card.Content;
MemoCard.Footer = Card.Footer;

export default MemoCard;
