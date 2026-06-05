import { motion } from 'motion/react';
import type { ReactNode } from 'react';

// ─── Animation variants ────────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// ─── StaggerList ──────────────────────────────────────────────────────────────

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  /** Override stagger delay between items (seconds). Default: 0.055 */
  staggerDelay?: number;
  /** Custom element to render. Default: motion.div */
  as?: any;
}

/**
 * StaggerList — A container that causes its `StaggerItem` children to
 * animate in sequentially (one by one) on mount.
 */
export function StaggerList({ children, className, staggerDelay, as: Component = motion.div }: StaggerListProps) {
  const variants = staggerDelay
    ? {
        ...containerVariants,
        visible: {
          transition: { staggerChildren: staggerDelay, delayChildren: 0.05 },
        },
      }
    : containerVariants;

  return (
    <Component
      className={className}
      variants={variants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </Component>
  );
}

// ─── StaggerItem ──────────────────────────────────────────────────────────────

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  /** Custom element to render. Default: motion.div */
  as?: any;
}

/**
 * StaggerItem — A direct child of `StaggerList`. It will fade + slide in
 * sequentially according to the parent container's stagger settings.
 */
export function StaggerItem({ children, className, as: Component = motion.div }: StaggerItemProps) {
  return (
    <Component className={className} variants={itemVariants}>
      {children}
    </Component>
  );
}
