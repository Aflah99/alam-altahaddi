-- Advisor: fix the search_path of the one community helper that did not pin it.
alter function public.cc_editable(public.subjects) set search_path = public;
