import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('react-pdf', () => ({ Document: () => null, Page: () => null, pdfjs: { GlobalWorkerOptions: {} } }));
vi.mock('jspdf', () => ({ jsPDF: vi.fn() }));
import { App } from '../takeoff-editor/src/main';

it('edits a placed heater type and watts while preserving its thermostat', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const {container} = render(<App />);
  const devices = ['baseboard-thermostat', 'baseboard-heater'].map((catalogItemId, index) => ({id: String(index), catalogItemId, position: {x: 100 + index * 100, y: 100}, planPageId: 'pdf-page-1', pdfPageNumber: 1, inclusionStatus: 'included'}));
  const project = {devices, pdfDataUrl: 'data:application/pdf;base64,dGVzdA==', connections: []};
  const input = container.querySelector('input[accept="application/json,.json,.takeoff.json"]')!;
  fireEvent.change(input, { target: { files: [{name: 'test.takeoff.json', text: async () => JSON.stringify(project)}] } });
  await waitFor(() => expect(screen.getByText('Project loaded with PDF and takeoff data.')).toBeTruthy());
  fireEvent.click(screen.getByText('BB', {selector: 'svg text'}));
  fireEvent.change(screen.getByLabelText('Heater wattage (W, up to 2,000)'), {target: {value: '1750'}});
  fireEvent.change(screen.getByLabelText('Controlled by thermostat'), {target: {value: '0'}});
  fireEvent.change(screen.getByLabelText('Device type'), {target: {value: 'wall-fan-heater'}});
  expect((screen.getByLabelText('Controlled by thermostat') as HTMLSelectElement).value).toBe('0');
  expect((screen.getByLabelText('Heater wattage (W, up to 2,000)') as HTMLInputElement).value).toBe('1750');
  expect(screen.getByText('WF', {selector: 'svg text'})).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Heater wattage (W, up to 2,000)'), {target: {value: '2500'}});
  expect((screen.getByLabelText('Heater wattage (W, up to 2,000)') as HTMLInputElement).value).toBe('2000');
  fireEvent.click(screen.getByText('T', {selector: 'svg text'}));
  expect(screen.getByRole('button', {name: 'Wall fan · 2000 W'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Disconnect'}));
  expect(screen.queryByRole('button', {name: 'Wall fan · 2000 W'})).toBeNull();
  vi.unstubAllGlobals();
});
