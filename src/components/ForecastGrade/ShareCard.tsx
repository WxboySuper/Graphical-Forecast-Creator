import React, { useCallback, useState } from 'react';
import { Download, Share2, Copy } from 'lucide-react';
import type { PackageGrade } from '../../utils/verificationV2';
import { downloadDataUrl } from '../../utils/exportUtils';
import { composeShareCard, shareCardFilename, shareSummaryText } from './shareCard';

interface ShareCardProps {
  pkg: PackageGrade;
  captureMap: () => Promise<HTMLImageElement | null>;
  addToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } else {
      resolve(null);
    }
  });

/**
 * Anonymous grade-plus-map share card. Offers download, native share (when
 * available), and copy (when supported); the user chooses. No identity by
 * default.
 */
const ShareCard: React.FC<ShareCardProps> = ({ pkg, captureMap, addToast }) => {
  const [busy, setBusy] = useState(false);

  const build = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const mapImage = await captureMap();
    return composeShareCard(pkg, mapImage);
  }, [captureMap, pkg]);

  const handleDownload = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await build();
      if (!canvas) {
        addToast('Could not compose the share card.', 'error');
        return;
      }
      downloadDataUrl(canvas.toDataURL('image/png'), shareCardFilename(pkg));
    } finally {
      setBusy(false);
    }
  }, [addToast, build, pkg]);

  const handleShare = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await build();
      const blob = canvas ? await canvasToBlob(canvas) : null;
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
    } catch {
      // User cancelled or share failed; no toast needed for cancel.
    } finally {
      setBusy(false);
    }
  }, [addToast, build, pkg]);

  const handleCopy = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = await build();
      const blob = canvas ? await canvasToBlob(canvas) : null;
      const clip = navigator.clipboard as Clipboard & { write?: (items: ClipboardItem[]) => Promise<void> };
      if (blob && typeof ClipboardItem !== 'undefined' && clip.write) {
        await clip.write([new ClipboardItem({ 'image/png': blob })]);
        addToast('Share card copied to clipboard.', 'success');
      } else if (clip.writeText) {
        await clip.writeText(shareSummaryText(pkg));
        addToast('Grade summary copied to clipboard.', 'success');
      } else {
        addToast('Copy is not supported here; try download.', 'info');
      }
    } catch {
      addToast('Copy failed; try download.', 'error');
    } finally {
      setBusy(false);
    }
  }, [addToast, build, pkg]);

  return (
    <div className="fg-section">
      <div className="fg-section-body pt-4">
        <div className="mb-2 text-sm font-semibold">Share this grade</div>
        <p className="mb-3 text-xs text-slate-500">Anonymous grade-plus-map card. No identity included.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="fg-touch inline-flex items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm disabled:opacity-50"
            onClick={handleDownload}
            disabled={busy}
          >
            <Download className="h-4 w-4" /> Download
          </button>
          <button
            type="button"
            className="fg-touch inline-flex items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm disabled:opacity-50"
            onClick={handleShare}
            disabled={busy}
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
          <button
            type="button"
            className="fg-touch inline-flex items-center gap-2 rounded-lg border border-slate-300/50 px-3 py-2 text-sm disabled:opacity-50"
            onClick={handleCopy}
            disabled={busy}
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareCard;
