import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Loader2, FileDown } from 'lucide-react';
import { useLanguage } from '@/shared/context/LanguageContext';

interface ExportConfirmationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  branchName: string;
}

export function ExportConfirmationModal({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
  branchName
}: ExportConfirmationModalProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-[32px] border-none shadow-2xl p-8 bg-white">
        <DialogHeader className="space-y-4">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-2">
            <FileDown className="w-7 h-7 text-indigo-600" />
          </div>
          <DialogTitle className="text-3xl font-black text-gray-900 tracking-tighter leading-none">
            {t('export.title').replace('{branch}', branchName)}
          </DialogTitle>
          <DialogDescription className="text-gray-500 font-medium text-base leading-relaxed pt-2">
            {t('export.desc')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-10 flex flex-col sm:flex-row gap-3">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1 h-14 rounded-2xl font-bold text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-xl shadow-indigo-600/20 font-bold gap-2 transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('export.processing')}
              </>
            ) : (
              <>
                <FileDown className="w-5 h-5" />
                {t('export.confirm')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
