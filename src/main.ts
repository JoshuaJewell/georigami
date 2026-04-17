import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { store } from './state/store.svelte';

const app = mount(App, { target: document.getElementById('app')! });

if (import.meta.env.DEV) (window as any).__store = store;

export default app;
