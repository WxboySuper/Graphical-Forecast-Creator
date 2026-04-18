import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface FloatingPanelProps {
  title: string;
  children: React.ReactNode;
  /** Position on screen */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'static';
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Whether panel can be closed */
  closable?: boolean;
  /** Called when close button clicked */
  onClose?: () => void;
  /** Additional className */
  className?: string;
  /** Icon to show in header */
  icon?: React.ReactNode;
  /** Whether to show the panel */
  visible?: boolean;
  /** Min width of panel */
  minWidth?: number;
  /** Additional inline style for the panel shell */
  style?: React.CSSProperties;
  /** Additional inline style for the content area */
  contentStyle?: React.CSSProperties;
  /** Additional className for the content area */
  contentClassName?: string;
}

// Define position classes for the floating panel
const positionClasses = {
  'top-left': 'top-20 left-4',
  'top-right': 'top-20 right-4',
  'bottom-left': 'bottom-[100px] left-4',
  'bottom-right': 'bottom-[100px] right-4',
  static: '',
};

// Define the FloatingPanel component
export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  children,
  position = 'top-left',
  defaultCollapsed = false,
  closable = false,
  onClose,
  className,
  icon,
  visible = true,
  minWidth = 240,
  style,
  contentStyle,
  contentClassName,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  // Handler for toggle button click - stops propagation to prevent triggering the header click which also toggles collapse
  const handleToggleButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    toggleCollapsed();
  }, [toggleCollapsed]);

  // Handler for close button click - stops propagation and calls onClose if provided
  const handleCloseButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClose?.();
  }, [onClose]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        position === 'static' ? 'relative' : 'absolute z-panel',
        'pointer-events-auto flex flex-col overflow-hidden',
        'bg-background border border-border rounded-lg shadow-lg',
        'transition-all duration-200',
        positionClasses[position],
        className
      )}
      style={{ minWidth, ...style }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2',
          'border-b border-border',
          'cursor-pointer select-none',
          'hover:bg-muted/50 transition-colors',
          'rounded-t-lg',
          isCollapsed && 'border-b-0 rounded-lg'
        )}
        onClick={toggleCollapsed}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="font-medium text-sm text-foreground">{title}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6"
            onClick={handleToggleButtonClick}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
          
          {closable && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6"
              onClick={handleCloseButtonClick}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className={cn('p-3 animate-fade-in', contentClassName)} style={contentStyle}>
          {children}
        </div>
      )}
    </div>
  );
};

export default FloatingPanel;
