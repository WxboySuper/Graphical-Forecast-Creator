import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface FloatingPanelProps {
  title: string;
  children: React.ReactNode;
  /** Position on screen */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
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
}

const positionClasses = {
  'top-left': 'top-20 left-4',
  'top-right': 'top-20 right-4',
  'bottom-left': 'bottom-[100px] left-4',
  'bottom-right': 'bottom-[100px] right-4',
};

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
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'absolute z-panel',
        'bg-background border border-border rounded-lg shadow-lg',
        'transition-all duration-200',
        positionClasses[position],
        className
      )}
      style={{ minWidth }}
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
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapsed();
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="p-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

export default FloatingPanel;
