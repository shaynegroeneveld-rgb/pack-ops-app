import {afterEach} from 'vitest';
import 'fake-indexeddb/auto';
import {cleanup} from '@testing-library/react';
afterEach(()=>{cleanup();localStorage.clear();});
Element.prototype.scrollIntoView=()=>{};
