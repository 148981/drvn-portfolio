import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../../utils/nutritionMotion';
import './Button.css';

/**
 * Standard Button Component
 * 
 * Variants:
 * - primary: Main action button
 * - secondary: Secondary action
 * - outline: Outlined style
 * - ghost: Minimal style
 * - danger: Destructive action
 * 
 * Sizes:
 * - sm, md, lg
 */
const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled = false,
    icon: Icon,
    iconPosition = 'left',
    className = '',
    onClick,
    type = 'button',
    ...props
}) => {
    const baseClass = 'ui-button';
    const variantClass = `button-${variant}`;
    const sizeClass = `button-${size}`;
    const fullWidthClass = fullWidth ? 'button-full-width' : '';
    const loadingClass = loading ? 'button-loading' : '';
    const disabledClass = disabled || loading ? 'button-disabled' : '';

    const combinedClassName = `${baseClass} ${variantClass} ${sizeClass} ${fullWidthClass} ${loadingClass} ${disabledClass} ${className}`.trim();

    return (
        <motion.button {...pressProps('row')}
 type={type}
 className={combinedClassName}
 onClick={onClick}
 disabled={disabled || loading}
 {...props}
 >
            {loading && <span className="button-spinner" />}
            {!loading && Icon && iconPosition === 'left' && (
                <Icon className="button-icon button-icon-left" size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} />
            )}
            <span className="button-text">{children}</span>
            {!loading && Icon && iconPosition === 'right' && (
                <Icon className="button-icon button-icon-right" size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} />
            )}
        </motion.button>
    );
};


export default Button;
