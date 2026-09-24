# Campaign naming: questions for the client

Drafted 24 September 2026 from the pending client questions P1 to P13 in `docs/spec.md`.
Written for the client's marketing operations lead. Fela sends it; the reply deadline is two
weeks from sending (O10), after which the assumption under each question is what gets built.
A shareable page version is published as an Artifact; this file is the source.

## Why we are asking

We are building the tool that will hold your naming conventions, generate compliant campaign
and ad group names with their tracking URLs, and check the names already live in your
accounts. A few facts about how you name things today decide how the tool is shaped. Each
question below says why it matters and what we will assume if we do not hear back. Answers
can be short; a sentence each is enough.

The first four change the shape of the tool, so please answer those first even if the rest
take longer.

## Please answer first

**1. Which levels need a naming convention, on each platform?**
For example campaign and ad group on Google Ads, or campaign, ad set and ad on Meta. The
names of the levels differ by platform, so tell us in your own terms.
Why it matters: it decides how many conventions we build and how they nest inside each other.
If unanswered we assume: two levels per platform, campaign plus ad group (Google, Microsoft)
or ad set (Meta, TikTok).

**2. Do your ad group names today repeat the first parts of the campaign name?**
For example campaign `perf_uk_sales` and ad group `perf_uk_broad_runners`, where `perf_uk`
is carried down.
Why it matters: the tool builds ad group names by carrying the campaign's leading parts
across. If your live ad groups do not do this, every one of them would show as non-compliant
the day the checker runs, and you would need to choose between renaming and a looser ad
group convention.
If unanswered we assume: yes, they repeat the leading parts.

**3. What separates the parts of a name, and do any names use special characters?**
Is it the same separator at every level, for example an underscore everywhere? Do any
current names contain a pipe `|`, plus `+`, ampersand `&`, colon, or spaces?
Why it matters: the separator is how the checker splits a name into parts. Tracking URLs can
only carry letters, digits, hyphen, underscore, dot and tilde without being rewritten, and a
rewritten campaign value would no longer match the campaign name in your analytics.
If unanswered we assume: one separator throughout each platform, and nothing outside that
character set in any name that feeds a tracking URL.

**4. What will you do with a batch of generated names?**
The tool can generate every allowed combination of a convention at once. Is that output a
reference list of permitted names, or a sheet you will upload through a platform editor such
as Google Ads Editor or a Meta bulk sheet? If upload, which platforms and which templates?
Why it matters: it decides the columns of the file. Upload sheets differ per platform.
If unanswered we assume: a plain CSV with one column per part of the name, the full name, and
the tracking URL, with the short code in every cell.

## The rest, when you can

**5. Where do `utm_source` and `utm_medium` come from?**
A fixed value per platform (for example `google` and `cpc`), a part of the name, or something
else?
If unanswered we assume: source is the platform, medium is a fixed value such as `cpc`.

**6. Is the landing page base URL fixed per convention, or typed in when a name is built?**
If unanswered we assume: a default per convention that can be edited at build time.

**7. When building an ad group under a campaign, may the carried-over parts ever be changed?**
If unanswered we assume: no, they are locked to the campaign.

**8. Which campaign parts should each ad group carry, and are they always the first ones?**
For example type and market but not objective.
If unanswered we assume: the first few required parts of the campaign name, in order.

**9. What case should tracking values use?**
If unanswered we assume: lowercase throughout.

**10. Must someone be able to build an ad group under a campaign whose name breaks the
convention?**
This matters during a transition when older campaigns are still live.
If unanswered we assume: no, a non-compliant campaign name blocks the ad group build until
the campaign is fixed.

**11. Do you use platform macros in URLs today, such as a campaign name placeholder in Meta
URL parameters?**
If unanswered we assume: no, the tool writes fixed values only.

**12. Which UTM parameters are required, and do you use `utm_term`, for example for
keywords?**
If unanswered we assume: source, medium and campaign required; content and term optional.

**13. How large is a realistic batch, and where do free-text values such as custom ids or
audience names come from today?**
If unanswered we assume: up to 50,000 rows at a time, with free-text values pasted one per
line.

## Also useful

An export of the distinct campaign and ad group (or ad set) names per platform, ideally from
the same warehouse tables the checker will read. We use it to test your conventions against
real names before anything is switched on, and to confirm the assumptions above against what
is actually live.
