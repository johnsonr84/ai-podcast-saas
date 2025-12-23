"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  PROGRESS_CAP_PERCENTAGE,
  PROGRESS_UPDATE_INTERVAL_MS,
} from "@/lib/constants";
import { estimateAssemblyAITime } from "@/lib/processing-time-estimator";

interface CompactProgressProps {
  jobStatus: Doc<"projects">["jobStatus"];
  fileDuration?: number;
  createdAt: number;
}

type JobState = "pending" | "running" | "completed" | "failed";

function isJobState(value: unknown): value is JobState {
  return (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed"
  );
}

export function CompactProgress({
  jobStatus,
  fileDuration,
  createdAt,
}: CompactProgressProps) {
  const [progress, setProgress] = useState(0);

  const transcriptionStatus: JobState | undefined = isJobState(jobStatus?.transcription)
    ? jobStatus!.transcription
    : undefined;

  const contentGenerationStatus: JobState | undefined = isJobState(jobStatus?.contentGeneration)
    ? jobStatus!.contentGeneration
    : undefined;

  const stepStatuses: Array<JobState | undefined> = useMemo(() => {
    const maybe = [
      jobStatus?.keyMoments,
      jobStatus?.summary,
      jobStatus?.socialPosts,
      jobStatus?.titles,
      jobStatus?.hashtags,
      jobStatus?.youtubeTimestamps,
    ];

    // normalize to JobState | undefined
    return maybe.map((s) => (isJobState(s) ? s : undefined));
  }, [jobStatus]);

  const completedSteps = useMemo(
    () => stepStatuses.filter((s) => s === "completed").length,
    [stepStatuses]
  );
  const totalSteps = stepStatuses.length;

  const anyFailed =
    transcriptionStatus === "failed" ||
    contentGenerationStatus === "failed" ||
    stepStatuses.some((s) => s === "failed");

  const isTranscribing = transcriptionStatus === "running";
  const isTranscribed = transcriptionStatus === "completed";

  // Consider generation “done” when all step statuses are completed
  const isGenerated = totalSteps > 0 && completedSteps === totalSteps;

  const statusText = useMemo(() => {
    if (anyFailed) return "⚠️ Failed";
    if (isTranscribing) return "🎙️ Transcribing...";
    if (isTranscribed && !isGenerated) return "✨ Generating content...";
    if (isTranscribed && isGenerated) return "✅ Complete";
    return "⏳ Processing...";
  }, [anyFailed, isTranscribing, isTranscribed, isGenerated]);

  useEffect(() => {
    if (anyFailed) {
      // Don’t animate forever on failures
      setProgress((p) => Math.min(p, 95));
      return;
    }

    // Done
    if (isTranscribed && isGenerated) {
      setProgress(100);
      return;
    }

    // Phase 1: Transcription (0 → 50) time-based
    if (isTranscribing) {
      const updateProgress = () => {
        const estimate = estimateAssemblyAITime(fileDuration);
        const elapsed = Math.floor((Date.now() - createdAt) / 1000);
        const raw = (elapsed / estimate.conservative) * 100;
        const capped = Math.min(PROGRESS_CAP_PERCENTAGE, raw);

        // map [0..cap] -> [0..50]
        const phase1 = Math.min(50, (capped / PROGRESS_CAP_PERCENTAGE) * 50);
        setProgress(phase1);
      };

      updateProgress();
      const interval = setInterval(updateProgress, PROGRESS_UPDATE_INTERVAL_MS);
      return () => clearInterval(interval);
    }

    // Phase 2: Generation (50 → 100) step-based
    if (isTranscribed) {
      const stepProgress =
        totalSteps > 0 ? (completedSteps / totalSteps) * 50 : 0;
      setProgress(50 + stepProgress);
      return;
    }

    // Default early state
    setProgress(10);
  }, [
    anyFailed,
    isTranscribing,
    isTranscribed,
    isGenerated,
    createdAt,
    fileDuration,
    completedSteps,
    totalSteps,
  ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge className="text-xs font-semibold bg-emerald-100 text-emerald-700 border-emerald-200">
          {statusText}
        </Badge>
        <span className="text-xs font-bold text-emerald-600">
          {Math.round(progress)}%
        </span>
      </div>

      <div className="relative h-2 bg-emerald-100 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 progress-emerald rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
