/**
 * Tier Utilities for Plan Detection and Validation
 *
 * Provides functions to:
 * - Validate uploads against plan limits using Clerk's has() method
 * - Check feature access
 *
 * All plan checks use Clerk's native billing system per:
 * https://clerk.com/docs/nextjs/guides/billing/for-b2c
 */

import { auth as clerkAuth } from "@clerk/nextjs/server";
import { convex } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import {
  PLAN_FEATURES,
  PLAN_LIMITS,
  type FeatureName,
  type PlanName,
} from "./tier-config";

type Auth = ReturnType<typeof clerkAuth>;

export interface UploadValidationResult {
  allowed: boolean;
  reason?: "file_size" | "duration" | "project_limit";
  message?: string;
  currentCount?: number;
  limit?: number;
}

/**
 * Resolve plan name using Clerk billing has() checks.
 * Defaults to "free".
 */
export function getPlanFromAuth(auth: Auth): PlanName {
  const has = auth?.has;
  if (has?.({ plan: "ultra" })) return "ultra";
  if (has?.({ plan: "pro" })) return "pro";
  return "free";
}

/**
 * Validate if user can upload a file based on their plan limits.
 */
export async function checkUploadLimits(
  auth: Auth,
  userId: string,
  fileSize: number,
  duration?: number
): Promise<UploadValidationResult> {
  const plan = getPlanFromAuth(auth);
  const limits = PLAN_LIMITS[plan];

  // File size
  if (fileSize > limits.maxFileSize) {
    return {
      allowed: false,
      reason: "file_size",
      message: `File size (${(fileSize / (1024 * 1024)).toFixed(
        1
      )}MB) exceeds your plan limit of ${(
        limits.maxFileSize /
        (1024 * 1024)
      ).toFixed(0)}MB`,
    };
  }

  // Duration (if provided and plan has a limit)
  if (typeof duration === "number" && limits.maxDuration !== null) {
    if (duration > limits.maxDuration) {
      const durationMinutes = Math.floor(duration / 60);
      const limitMinutes = Math.floor(limits.maxDuration / 60);
      return {
        allowed: false,
        reason: "duration",
        message: `Duration (${durationMinutes} minutes) exceeds your plan limit of ${limitMinutes} minutes`,
      };
    }
  }

  // Project count (skip for unlimited)
  if (limits.maxProjects !== null) {
    const includeDeleted = plan === "free";
    const projectCount = await convex.query(api.projects.getUserProjectCount, {
      userId,
      includeDeleted,
    });

    if (projectCount >= limits.maxProjects) {
      return {
        allowed: false,
        reason: "project_limit",
        message: `You've reached your plan limit of ${limits.maxProjects} ${
          plan === "free" ? "total" : "active"
        } projects`,
        currentCount: projectCount,
        limit: limits.maxProjects,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if user has access to a specific feature using Clerk billing.
 */
export function checkFeatureAccess(auth: Auth, feature: FeatureName): boolean {
  const has = auth?.has;
  return has ? has({ feature }) : false;
}

/**
 * Get list of features available to a plan.
 */
export function getPlanFeatures(plan: PlanName): FeatureName[] {
  return PLAN_FEATURES[plan];
}

/**
 * Check if a plan includes a feature.
 */
export function planHasFeature(plan: PlanName, feature: FeatureName): boolean {
  return PLAN_FEATURES[plan].includes(feature);
}

/**
 * Get the minimum plan required for a feature.
 */
export function getMinimumPlanForFeature(feature: FeatureName): PlanName {
  if (PLAN_FEATURES.free.includes(feature)) return "free";
  if (PLAN_FEATURES.pro.includes(feature)) return "pro";
  return "ultra";
}
