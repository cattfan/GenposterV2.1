import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import type { DesignDocument } from "@/models";
import type { DesignEditorState } from "./designStore";

const AUTOSAVE_DELAY_MS = 500;

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function buildDocumentSignature(
  editorState: DesignEditorState,
  isElementTransforming: boolean,
  lastComputedDocumentSignatureRef: MutableRefObject<string>,
) {
  if (isElementTransforming && lastComputedDocumentSignatureRef.current) {
    return lastComputedDocumentSignatureRef.current;
  }

  const nextSignature = [
    editorState.designDocumentId,
    editorState.mode,
    editorState.updatedAt,
    editorState.activePageId,
    editorState.pageOrder.length,
    Object.keys(editorState.elementsById).length,
  ].join(":");
  lastComputedDocumentSignatureRef.current = nextSignature;
  return nextSignature;
}

export function useDesignAutosave({
  autosave,
  onSave,
  document,
  documentIdentity,
  editorState,
  lastComputedDocumentSignatureRef,
}: {
  autosave: boolean;
  onSave?: (document: DesignDocument) => void | Promise<void>;
  document: DesignDocument;
  documentIdentity: string;
  editorState: DesignEditorState;
  lastComputedDocumentSignatureRef: MutableRefObject<string>;
}) {
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [isElementTransforming, setIsElementTransforming] = useState(false);
  const elementTransformingRef = useRef(false);
  const documentSignature = useMemo(
    () =>
      buildDocumentSignature(
        editorState,
        isElementTransforming,
        lastComputedDocumentSignatureRef,
      ),
    [
      editorState.activePageId,
      editorState.designDocumentId,
      editorState.elementsById,
      editorState.mode,
      editorState.pageOrder.length,
      editorState.updatedAt,
      isElementTransforming,
      lastComputedDocumentSignatureRef,
    ],
  );
  const onSaveRef = useRef(onSave);
  const autosaveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<{ document: DesignDocument; signature: string } | null>(null);
  const autosaveErrorToastShownRef = useRef(false);
  const latestDocumentRef = useRef<DesignDocument | null>(null);
  const latestSignatureRef = useRef("");
  const lastSavedSignatureRef = useRef(documentSignature);
  const autosaveDocumentIdentityRef = useRef(documentIdentity);

  onSaveRef.current = onSave;
  latestDocumentRef.current = document;
  latestSignatureRef.current = documentSignature;

  const beginElementTransform = useCallback(() => {
    if (elementTransformingRef.current) return;
    elementTransformingRef.current = true;
    setIsElementTransforming(true);
  }, []);

  const endElementTransform = useCallback(() => {
    if (!elementTransformingRef.current) return;
    elementTransformingRef.current = false;
    setIsElementTransforming(false);
  }, []);

  const flushAutosaveQueue = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    try {
      while (queuedSaveRef.current && onSaveRef.current) {
        const nextSave = queuedSaveRef.current;
        queuedSaveRef.current = null;

        if (nextSave.signature === lastSavedSignatureRef.current) continue;

        setAutosaveStatus("saving");

        try {
          await onSaveRef.current(nextSave.document);
          lastSavedSignatureRef.current = nextSave.signature;
          autosaveErrorToastShownRef.current = false;
          setAutosaveStatus(queuedSaveRef.current ? "pending" : "saved");
        } catch (error) {
          setAutosaveStatus("error");
          if (!autosaveErrorToastShownRef.current) {
            autosaveErrorToastShownRef.current = true;
            toast.error(error instanceof Error ? error.message : "Autosave thất bại");
          }
        }
      }
    } finally {
      saveInFlightRef.current = false;
    }
  }, []);

  const queueAutosave = useCallback(
    (documentToSave: DesignDocument, signature: string) => {
      if (!onSaveRef.current || signature === lastSavedSignatureRef.current) return;
      queuedSaveRef.current = { document: documentToSave, signature };
      void flushAutosaveQueue();
    },
    [flushAutosaveQueue],
  );

  useEffect(() => {
    if (autosaveDocumentIdentityRef.current !== documentIdentity) {
      autosaveDocumentIdentityRef.current = documentIdentity;
      lastSavedSignatureRef.current = documentSignature;
      queuedSaveRef.current = null;
      setAutosaveStatus(autosave && onSaveRef.current ? "saved" : "idle");
    }
  }, [autosave, documentIdentity, documentSignature]);

  useEffect(() => {
    if (!autosave || !onSaveRef.current) return;

    if (documentSignature === lastSavedSignatureRef.current) {
      setAutosaveStatus("saved");
      return;
    }

    setAutosaveStatus("pending");
    autosaveTimerRef.current = window.setTimeout(() => {
      const documentToSave = latestDocumentRef.current;
      if (!documentToSave) return;
      queueAutosave(documentToSave, documentSignature);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [autosave, documentSignature, queueAutosave]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!autosave) return;
    if (autosaveStatus !== "pending" && autosaveStatus !== "saving") return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autosave, autosaveStatus]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (!autosave || !latestDocumentRef.current) return;
      queueAutosave(latestDocumentRef.current, latestSignatureRef.current);
    };
  }, [autosave, queueAutosave]);

  return {
    autosaveStatus,
    documentSignature,
    isElementTransforming,
    beginElementTransform,
    endElementTransform,
  };
}

