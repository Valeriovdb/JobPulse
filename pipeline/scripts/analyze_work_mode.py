"""
Analyze work_mode classification for active jobs.

Reports:
- How many active jobs have work_mode = 'unknown'
- How many of those have a description_text (LLM can re-enrich)
- How many have no description (can't do more)
- Samples of LLM raw JSON to see what the LLM actually returned

Usage:
  python -m pipeline.scripts.analyze_work_mode
"""
import json
import logging
import sys

from pipeline.db import get_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("analyze_work_mode")


def run() -> None:
    db = get_client()

    # All active jobs
    resp = (
        db.table("jobs")
        .select("job_id, company_name, job_title_raw, work_mode, description_text, llm_raw_json, source_provider")
        .eq("is_active", True)
        .execute()
    )
    jobs = resp.data
    n_active = len(jobs)

    # Split by work_mode
    unknown = [j for j in jobs if j.get("work_mode") in (None, "unknown")]
    classified = [j for j in jobs if j.get("work_mode") not in (None, "unknown")]

    logger.info(f"Active jobs: {n_active}")
    logger.info(f"  Classified work_mode: {len(classified)}")
    logger.info(f"  Unknown work_mode:    {len(unknown)}")

    # Of the unknown ones, how many have descriptions?
    unknown_with_desc = [j for j in unknown if j.get("description_text") and len(j["description_text"].strip()) >= 80]
    unknown_no_desc = [j for j in unknown if not j.get("description_text") or len((j.get("description_text") or "").strip()) < 80]

    logger.info(f"\nAmong unknown work_mode jobs:")
    logger.info(f"  With description (can re-enrich): {len(unknown_with_desc)}")
    logger.info(f"  No/short description (cannot):    {len(unknown_no_desc)}")

    # Source breakdown for unknown
    sources = {}
    for j in unknown:
        src = j.get("source_provider", "unknown")
        sources[src] = sources.get(src, 0) + 1
    logger.info(f"\n  Source breakdown of unknown work_mode:")
    for src, count in sorted(sources.items(), key=lambda x: -x[1]):
        logger.info(f"    {src}: {count}")

    # Check what the LLM actually returned for work_mode on these jobs
    logger.info(f"\n--- Sample LLM responses for unknown work_mode jobs (with descriptions) ---")
    for j in unknown_with_desc[:10]:
        llm_json = j.get("llm_raw_json")
        if isinstance(llm_json, str):
            try:
                llm_json = json.loads(llm_json)
            except Exception:
                pass
        wm_from_llm = None
        if isinstance(llm_json, dict):
            wm_from_llm = llm_json.get("work_mode")
        desc_preview = (j.get("description_text") or "")[:200].replace("\n", " ")
        logger.info(
            f"\n  {j.get('company_name', '?')} — {j.get('job_title_raw', '?')}"
            f"\n    DB work_mode: {j.get('work_mode')}"
            f"\n    LLM returned: {wm_from_llm}"
            f"\n    Description preview: {desc_preview}..."
        )

    # Jobs without description
    if unknown_no_desc:
        logger.info(f"\n--- Jobs with unknown work_mode and NO description ---")
        for j in unknown_no_desc[:10]:
            logger.info(
                f"  {j.get('company_name', '?')} — {j.get('job_title_raw', '?')} "
                f"[source: {j.get('source_provider')}]"
            )


if __name__ == "__main__":
    try:
        run()
    except Exception as e:
        logger.exception(f"Fatal: {e}")
        sys.exit(1)
