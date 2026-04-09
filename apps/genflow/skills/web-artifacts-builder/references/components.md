# shadcn/ui Components Reference

All available components for use in web artifacts. Import from `@/components/ui/<name>`.

## Layout & Structure

| Component | Import | Description |
|-----------|--------|-------------|
| Accordion | `@/components/ui/accordion` | Collapsible content sections |
| Aspect Ratio | `@/components/ui/aspect-ratio` | Maintains width-to-height ratio |
| Card | `@/components/ui/card` | Container with header, content, footer |
| Collapsible | `@/components/ui/collapsible` | Expandable/collapsible section |
| Resizable | `@/components/ui/resizable` | Resizable panel groups |
| Scroll Area | `@/components/ui/scroll-area` | Custom scrollable area |
| Separator | `@/components/ui/separator` | Visual divider |
| Sheet | `@/components/ui/sheet` | Slide-out panel from edge |
| Sidebar | `@/components/ui/sidebar` | App sidebar navigation |
| Skeleton | `@/components/ui/skeleton` | Loading placeholder |
| Table | `@/components/ui/table` | Data table with headers and rows |

## Navigation

| Component | Import | Description |
|-----------|--------|-------------|
| Breadcrumb | `@/components/ui/breadcrumb` | Page hierarchy trail |
| Command | `@/components/ui/command` | Command palette / search |
| Context Menu | `@/components/ui/context-menu` | Right-click menu |
| Dropdown Menu | `@/components/ui/dropdown-menu` | Dropdown action menu |
| Menubar | `@/components/ui/menubar` | Horizontal menu bar |
| Navigation Menu | `@/components/ui/navigation-menu` | Top-level site navigation |
| Pagination | `@/components/ui/pagination` | Page navigation controls |
| Tabs | `@/components/ui/tabs` | Tabbed content sections |

## Forms & Inputs

| Component | Import | Description |
|-----------|--------|-------------|
| Button | `@/components/ui/button` | Clickable button with variants |
| Calendar | `@/components/ui/calendar` | Date picker calendar |
| Checkbox | `@/components/ui/checkbox` | Toggle checkbox |
| Form | `@/components/ui/form` | Form wrapper with react-hook-form + zod |
| Input | `@/components/ui/input` | Text input field |
| Input OTP | `@/components/ui/input-otp` | One-time password input |
| Label | `@/components/ui/label` | Form field label |
| Radio Group | `@/components/ui/radio-group` | Radio button group |
| Select | `@/components/ui/select` | Dropdown select |
| Slider | `@/components/ui/slider` | Range slider |
| Switch | `@/components/ui/switch` | Toggle switch |
| Textarea | `@/components/ui/textarea` | Multi-line text input |

## Feedback & Overlays

| Component | Import | Description |
|-----------|--------|-------------|
| Alert | `@/components/ui/alert` | Inline alert message |
| Alert Dialog | `@/components/ui/alert-dialog` | Confirmation dialog |
| Dialog | `@/components/ui/dialog` | Modal dialog |
| Drawer | `@/components/ui/drawer` | Bottom sheet / drawer (via vaul) |
| Hover Card | `@/components/ui/hover-card` | Card on hover |
| Popover | `@/components/ui/popover` | Floating popover |
| Progress | `@/components/ui/progress` | Progress bar |
| Sonner | `@/components/ui/sonner` | Toast notifications (via sonner) |
| Toast | `@/components/ui/toast` | Toast notifications (radix) |
| Tooltip | `@/components/ui/tooltip` | Hover tooltip |

## Display

| Component | Import | Description |
|-----------|--------|-------------|
| Avatar | `@/components/ui/avatar` | User avatar with fallback |
| Badge | `@/components/ui/badge` | Status badge / tag |
| Carousel | `@/components/ui/carousel` | Image/content carousel (via embla) |
| Chart | `@/components/ui/chart` | Chart wrapper |
| Toggle | `@/components/ui/toggle` | Toggle button |
| Toggle Group | `@/components/ui/toggle-group` | Group of toggle buttons |

## Composite Patterns

These are not standalone components but patterns built from the components above:

| Pattern | Built With | Description |
|---------|-----------|-------------|
| Combobox | Command + Popover | Searchable select |
| Data Table | Table + tanstack/react-table | Sortable, filterable table |
| Date Picker | Calendar + Popover | Date selection |

## Common Import Examples

```tsx
// Buttons
import { Button } from "@/components/ui/button"

// Cards
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"

// Dialogs
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

// Forms
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Tables
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Navigation
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// Feedback
import { toast } from "sonner"
```

## Docs

Full documentation: https://ui.shadcn.com/docs/components
Community components: https://ui.shadcn.com/docs/directory
