# TOC Sidebar Implementation Plan

## Overview
Transform the inline TOC into a floating sidebar that sits alongside article content on desktop, with mobile-friendly collapsible behavior.

## Changes

### 1. single.html - Restructure DOM
- Wrap content + TOC in `.post-with-sidebar` container
- Move TOC outside `.content` div to be sibling
- Add toggle button for mobile collapse/expand

### 2. main.css - Sidebar Styles
- Desktop (1024px+): TOC fixed on right, 220px width
- Content has right margin to avoid overlap
- TOC uses `position: sticky` to follow scroll
- Mobile: TOC collapses into expandable section

### 3. main.js - Scroll Spy
- Intersection Observer to track visible headings
- Add `.active` class to current TOC item
- Smooth scroll on TOC click

## Breakpoints
- 1024px+: Full sidebar layout
- <1024px: TOC above content, collapsible on mobile