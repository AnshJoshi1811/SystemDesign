import React from 'react';
import { ChapterPlayer } from './lesson/ChapterPlayer';
import { LESSONS } from './ch6/lessons';

interface Chapter6KeyValueStoreProps {
  /** Kept for API compatibility with App; theming uses Tailwind `dark:` bound to the app toggle. */
  isDarkMode?: boolean;
}

export const Chapter6KeyValueStore: React.FC<Chapter6KeyValueStoreProps> = () => <ChapterPlayer chapterId="chapter6" lessons={LESSONS} />;
