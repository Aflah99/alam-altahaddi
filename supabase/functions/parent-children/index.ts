// Edge Function entry point (Deno). Logic lives in handler.ts so it can be tested.
import { serve } from '../_shared/http.ts'
import { handleParentChildren } from './handler.ts'

serve(handleParentChildren)
