import { Skeleton } from "@/components/ui/skeleton";

export const LoginSkeleton = () => {
  return (
    <div className="min-h-screen bg-[#f5f5f7] p-5">
      <div className="mx-auto flex h-20 max-w-6xl items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <Skeleton className="h-5 w-32 rounded-full" />
      </div>
      <div className="mx-auto mt-16 w-full max-w-[480px] space-y-6 rounded-[30px] border border-black/[0.06] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <Skeleton className="size-11 rounded-2xl" />
        <Skeleton className="h-9 w-3/5 rounded-full" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </div>
  );
};
