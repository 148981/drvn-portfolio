import React from 'react';
import './Input.css';

/**
 * Standard Input Component
 * 
 * Types: text, email, password, number, tel, url
 * Sizes: sm, md, lg
 */
const Input = ({
    label,
    type = 'text',
    size = 'md',
    fullWidth = false,
    error = null,
    helperText = null,
    icon: Icon,
    iconPosition = 'left',
    disabled = false,
    required = false,
    className = '',
    ...props
}) => {
    const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseClass = 'ui-input-wrapper';
    const fullWidthClass = fullWidth ? 'input-full-width' : '';
    const errorClass = error ? 'input-has-error' : '';

    const combinedWrapperClassName = `${baseClass} ${fullWidthClass} ${errorClass} ${className}`.trim();

    const inputBaseClass = 'ui-input';
    const sizeClass = `input-${size}`;
    const iconClass = Icon ? `input-with-icon input-icon-${iconPosition}` : '';
    const disabledClass = disabled ? 'input-disabled' : '';

    const combinedInputClassName = `${inputBaseClass} ${sizeClass} ${iconClass} ${disabledClass}`.trim();

    return (
        <div className={combinedWrapperClassName}>
            {label && (
                <label htmlFor={inputId} className="input-label">
                    {label}
                    {required && <span className="input-required">*</span>}
                </label>
            )}

            <div className="input-container">
                {Icon && iconPosition === 'left' && (
                    <Icon className="input-icon input-icon-left" size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} />
                )}

                <input
                    {...props}
                    id={inputId}
                    type={type}
                    className={combinedInputClassName}
                    disabled={disabled}
                    required={required}
                />

                {Icon && iconPosition === 'right' && (
                    <Icon className="input-icon input-icon-right" size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} />
                )}
            </div>

            {(error || helperText) && (
                <div className={`input-helper ${error ? 'input-helper-error' : ''}`}>
                    {error || helperText}
                </div>
            )}
        </div>
    );
};


export default Input;
