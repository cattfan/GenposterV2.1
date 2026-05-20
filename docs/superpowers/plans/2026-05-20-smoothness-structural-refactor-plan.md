# Smoothness & Structural Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm app mượt hơn và tách PackTabContent + DesignWorkspace thành modules nhỏ hơn, không đổi behavior.

**Architecture:** 5 waves tuần tự — shared libs → perf → PackTabContent hooks → DesignWorkspace split → verify.

**Tech Stack:** TypeScript, React 19, Vitest, Vite, TanStack Router.

---

See [spec](../specs/2026-05-20-smoothness-structural-refactor-design.md) for full scope. Tasks mirror plan waves 1–5 with verify steps after each wave.
