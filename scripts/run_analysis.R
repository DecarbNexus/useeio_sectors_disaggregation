# Beginner-friendly runner: executes the analysis Rmd without creating a document.
# - No Pandoc or HTML output required
# - Extracts R code from the Rmd and runs it in the Global Environment
# - Outputs are written to the outputs/ folder
#
# Usage:
#   source("scripts/run_analysis.R")

# 0) Make working directory robust: set project root by locating config.yml
find_project_root <- function(start = getwd(), marker = "config.yml", max_up = 8){
	d <- normalizePath(start, winslash = "/", mustWork = FALSE)
	for (i in seq_len(max_up)){
		cand <- file.path(d, marker)
		if (file.exists(cand)) return(d)
		parent <- dirname(d)
		if (identical(parent, d)) break
		d <- parent
	}
	return(getwd())
}

project_root <- find_project_root()
setwd(project_root)
cat("Project root:", project_root, "\n")

rmd <- "analysis/generate_scope3_disaggregation_table_tier1_2_3+.Rmd"
if (!file.exists(rmd)) {
	stop("Cannot find ", rmd, ". Current working directory is ", getwd())
}

if (!requireNamespace("knitr", quietly = TRUE)) install.packages("knitr")

tmp <- tempfile(fileext = ".R")
ok <- FALSE
try({
	knitr::purl(rmd, output = tmp, documentation = 0, quiet = TRUE)
	ok <- TRUE
}, silent = TRUE)
if (!ok) stop("Failed to extract R code from ", rmd, ". Ensure knitr is installed.")

# Optional: start from a clean .GlobalEnv
# rm(list = ls(envir = .GlobalEnv), envir = .GlobalEnv)

cat("Running analysis code...\n")
tryCatch({
	# Use source() (not sys.source) so echo and max.deparse.length are supported across R versions
		# Keep working directory at project_root so relative paths like "config.yml" resolve
		source(tmp, local = .GlobalEnv, echo = TRUE, max.deparse.length = Inf, keep.source = TRUE, chdir = FALSE)
	cat("\nAnalysis complete. Excel/CSVs are written to outputs/.\n")
}, error = function(e){
	message("\nERROR while running analysis: ", conditionMessage(e))
	message("Working dir: ", getwd())
	message("R version: ", paste(R.version$major, R.version$minor, sep = "."))
	message("Tip: Run chunks interactively to pinpoint the failing step.")
	stop(e)
})
