import React from 'react';

/** Animated shimmer placeholder used while chapters lazy-load. */
const Shimmer: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`animate-pulse rounded ${className}`}
    style={{ background: 'var(--surface-muted)' }}
    aria-hidden
  />
);

export const ChapterSkeleton: React.FC = () => (
  <div className="max-w-4xl mx-auto pt-2 pb-24 space-y-6" aria-label="Loading chapter…" role="status">
    {/* Lesson header */}
    <div className="space-y-3">
      <Shimmer className="h-3 w-20" />
      <Shimmer className="h-8 w-2/3" />
      <Shimmer className="h-4 w-full max-w-xl" />
      <Shimmer className="h-4 w-3/4 max-w-lg" />
    </div>

    {/* Section label */}
    <Shimmer className="h-3 w-24 mt-8" />

    {/* Content block */}
    <div
      className="rounded-2xl p-6 space-y-3"
      style={{ border: '1px solid var(--header-border)', background: 'var(--surface)' }}
    >
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-4 w-5/6" />
      <Shimmer className="h-4 w-4/5" />
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-4 w-2/3" />
    </div>

    {/* Interactive block */}
    <Shimmer className="h-3 w-16 mt-2" />
    <div
      className="rounded-2xl p-6 space-y-4"
      style={{ border: '1px solid var(--header-border)', background: 'var(--surface)' }}
    >
      <div className="flex gap-3">
        <Shimmer className="h-10 w-32 rounded-lg" />
        <Shimmer className="h-10 w-24 rounded-lg" />
      </div>
      <Shimmer className="h-40 w-full rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        <Shimmer className="h-16 rounded-xl" />
        <Shimmer className="h-16 rounded-xl" />
        <Shimmer className="h-16 rounded-xl" />
      </div>
    </div>

    {/* Quiz block */}
    <Shimmer className="h-3 w-24" />
    <div
      className="rounded-2xl p-6 space-y-3"
      style={{ border: '1px solid var(--header-border)', background: 'var(--surface)' }}
    >
      <Shimmer className="h-4 w-3/4" />
      <div className="space-y-2 mt-4">
        <Shimmer className="h-10 w-full rounded-lg" />
        <Shimmer className="h-10 w-full rounded-lg" />
        <Shimmer className="h-10 w-full rounded-lg" />
      </div>
    </div>

    <span className="sr-only">Loading chapter content…</span>
  </div>
);
