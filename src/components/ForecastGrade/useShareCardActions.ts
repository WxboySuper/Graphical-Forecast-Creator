import { useCallback, useState } from 'react';
import type { PackageGrade } from '../../utils/verificationV2';
import { downloadDataUrl } from '../../utils/exportUtils';
import { composeShareCard, shareCardFilename, shareSummaryText } from './shareCard';

type AddToast = (message: string, type?: 'info' | 'success' | 'error') => void;

interface ShareCardActionsOptions {
  pkg: PackageGrade;
  captureMap: () => Promise<HTMLImageElement | null>;
  addToast: AddToast;
}

export interface ShareCardActions {
  busy: boolean;
  handleDownload: () => Promise<void>;
  handleShare: () => Promise<void>;
  handleCopy: () => Promise<void>;
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } else {
      resolve(null);
    }
  });

const shareBlob = async (
  blob: Blob | null,
  pkg: PackageGrade,
  addToast: AddToast
): Promise<void> => {
  if (!blob) {
    addToast('Sharing is unavailable; try download.', 'info');
    return;
  }
  const file = new File([blob], shareCardFilename(pkg), { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], text: shareSummaryText(pkg) });
  } else {
    addToast('Native share is not available on this device.', 'info');
  }
};

const copyBlob = async (
  blob: Blob | null,
  pkg: PackageGrade,
  addToast: AddToast
): Promise<void> => {
  const clip = navigator.clipboard as Clipboard & { write?: (items: ClipboardItem[]) => Promise<void> };
  const canWriteImage = Boolean(blob) && typeof ClipboardItem !== 'undefined' && Boolean(clip.write);

  if (canWriteImage) {
    await clip.write!([new ClipboardItem({ 'image/png': blob as Blob })]);
    addToast('Share card copied to clipboard.', 'success');
    return;
  }
  if (clip.writeText) {
    await clip.writeText(shareSummaryText(pkg));
    addToast('Grade summary copied to clipboard.', 'success');
    return;
  }
  addToast('Copy is not supported here; try download.', 'info');
};

/**
 * Encapsulates the download / native-share / copy handlers for the share card,
 * along with the shared busy state. Keeps the presentational component thin.
 */
export const useShareCardActions = ({ pkg, captureMap, addToast }: ShareCardActionsOptions): ShareCardActions => {
  const [busy, setBusy] = useState(false);

  const build = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const mapImage = await captureMap();
    return composeShareCard(pkg, mapImage);
  }, [captureMap, pkg]);

  const runBusy = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDownload = useCallback(
    () =>
      runBusy(async () => {
        const canvas = await build();
        if (!canvas) {
          addToast('Could not compose the share card.', 'error');
          return;
        }
        downloadDataUrl(canvas.toDataURL('image/png'), shareCardFilename(pkg));
      }),
    [addToast, build, pkg, runBusy]
  );

  const handleShare = useCallback(
    () =>
      runBusy(async () => {
        try {
          const canvas = await build();
          const blob = canvas ? await canvasToBlob(canvas) : null;
          await shareBlob(blob, pkg, addToast);
        } catch {
          // User cancelled or share failed; no toast needed for cancel.
        }
      }),
    [addToast, build, pkg, runBusy]
  );

  const handleCopy = useCallback(
    () =>
      runBusy(async () => {
        try {
          const canvas = await build();
          const blob = canvas ? await canvasToBlob(canvas) : null;
          await copyBlob(blob, pkg, addToast);
        } catch {
          addToast('Copy failed; try download.', 'error');
        }
      }),
    [addToast, build, pkg, runBusy]
  );

  return { busy, handleDownload, handleShare, handleCopy };
};
