import React, { memo } from 'react';
import './Badge.css';

/**
 * Badge Component
 * 
 * Variants: primary, success, warning, error, info, neutral
 * Sizes: sm, md, lg
 */
const Badge = ({
    children,
    variant = 'neutral',
    size = 'md',
    icon: Icon,
    dot = false,
    className = '',
    ...props
}) => {
    const baseClass = 'ui-badge';
    const variantClass = `badge-${variant}`;
    const sizeClass = `badge-${size}`;
    const dotClass = dot ? 'badge-with-dot' : '';

    const combinedClassName = `${baseClass} ${variantClass} ${sizeClass} ${dotClass} ${className}`.trim();

    return (
        <span className={combinedClassName} {...props}>
            {dot && <span className="badge-dot" />}
            {Icon && <Icon className="badge-icon" size={size === 'sm' ? 12 : size === 'lg' ? 16 : 14} />}
            {children}
        </span>
    );
};


// 🟢 P2-2: 純展示元件、props 驅動 → memo 避免父層重渲染時連帶重繪
export default memo(Badge);
