// src/components/Loading.tsx

interface LoadingProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  inline?: boolean;
}

export default function Loading({ 
  message = "Loading...", 
  size = "md", 
  fullScreen = false,
  inline = false 
}: LoadingProps) {
  const sizeClasses = {
    sm: "w-4 h-4 border-2",
    md: "w-8 h-8 border-3",
    lg: "w-12 h-12 border-4"
  };

  const spinner = (
    <div className={`${inline ? 'inline-flex' : 'flex'} items-center gap-3`}>
      <div 
        className={`${sizeClasses[size]} border-indigo-200 border-t-indigo-600 rounded-full animate-spin`}
        role="status"
        aria-label="Loading"
      />
      {message && (
        <span className={`text-slate-600 ${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base'}`}>
          {message}
        </span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          {spinner}
        </div>
      </div>
    );
  }

  if (inline) {
    return spinner;
  }

  return (
    <div className="flex items-center justify-center p-8">
      {spinner}
    </div>
  );
}

export function LoadingOverlay({ message = "Processing..." }: { message?: string }) {
  return (
    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl z-20 flex items-center justify-center">
      <Loading message={message} size="md" />
    </div>
  );
}

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-200 rounded-lg"
          style={{ width: `${Math.random() * 30 + 70}%` }}
        />
      ))}
    </div>
  );
}