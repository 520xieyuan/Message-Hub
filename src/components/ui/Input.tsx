import React from 'react'
import { cn } from '../../utils/cn'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onFocus' | 'onBlur'> {
  label?: string
  error?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', label, error, helperText, leftIcon, rightIcon, ...props }, ref) => {
    const inputId = React.useId()
    const internalRef = React.useRef<HTMLInputElement>(null)

    // 合并 refs
    React.useImperativeHandle(ref, () => internalRef.current as HTMLInputElement)

    // 确保输入框可以正确聚焦 - 修复 Electron 应用焦点问题
    const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLInputElement>) => {
      // 防止默认行为可能导致的焦点问题
      const target = e.currentTarget

      // 确保输入框获得焦点
      setTimeout(() => {
        if (target && document.activeElement !== target) {
          target.focus()
        }
      }, 0)

      // 调用原始的 onMouseDown
      props.onMouseDown?.(e)
    }, [props.onMouseDown])

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLInputElement>) => {
      const target = e.currentTarget

      // 确保输入框获得焦点
      if (document.activeElement !== target) {
        target.focus()
      }

      // 调用原始的 onClick
      props.onClick?.(e)
    }, [props.onClick])

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            className={cn(
              'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500',
              className
            )}
            ref={internalRef}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }