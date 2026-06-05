/**
 * PageSkeleton — A slim animated progress bar shown at the top of the screen
 * while a lazy-loaded page chunk is being downloaded. Much lighter than a
 * full-screen spinner and doesn't block the visible layout.
 */
export default function PageSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col pointer-events-none">
      {/* Animated progress bar */}
      <div className="h-[3px] w-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full"
          style={{
            animation: 'page-progress 1.4s ease-in-out infinite',
          }}
        />
      </div>

      {/* Content area skeleton */}
      <div className="flex-1 flex items-start justify-center pt-24 px-8">
        <div className="w-full max-w-5xl space-y-4 animate-pulse">
          {/* Heading skeleton */}
          <div className="h-7 w-48 bg-gray-100 rounded-xl" />
          <div className="h-4 w-72 bg-gray-100 rounded-lg" />

          {/* Card row skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-3xl" />
            ))}
          </div>

          {/* Content block skeleton */}
          <div className="h-64 bg-gray-100 rounded-3xl mt-4" />
        </div>
      </div>

      <style>{`
        @keyframes page-progress {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { width: 70%; }
          100% { transform: translateX(200%); width: 40%; }
        }
      `}</style>
    </div>
  );
}
