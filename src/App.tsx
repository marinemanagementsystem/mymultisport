/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { APIProvider } from '@vis.gl/react-google-maps';
import MainLayout from './components/MainLayout';

const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_BROWSER_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

export default function App() {
  if (!hasValidKey) {
    return <MainLayout mapsAvailable={false} />;
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <MainLayout mapsAvailable />
    </APIProvider>
  );
}
