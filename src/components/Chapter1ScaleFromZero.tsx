import React from 'react';
import { Chapter1Workspace } from './ch1/Workspace';

/** Chapter 1 uses a full-width architecture workspace instead of the standard lesson player. */
export const Chapter1ScaleFromZero: React.FC<{ isDarkMode?: boolean }> = () => <Chapter1Workspace />;
