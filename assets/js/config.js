/* =====================================================================
   SITE SETTINGS – edit this file to adapt the Variant interpreter to a
   course. (No build step: edit, commit, and GitHub Pages updates.)
   Never put a password or an API key here: anyone can read the files of
   a public site.
   ===================================================================== */
window.VI_CONFIG = {
  /* the name at the top of the page, and the line under it */
  title: 'Variant interpreter',
  subtitle: 'for teaching clinical genomics',

  /* the genome build that new patients' variants use (each variant keeps its own) */
  defaultAssembly: 'GRCh38',

  /* The guidelines new users follow (each user can change it in Settings, and beside each classification):
       'acgs2024' – the UK's ACGS 2024 guidelines (points; PM2 moderate; PP3/BP4 supporting only)
       'clingen'  – ClinGen's guidance and its expert panels (points; PM2 supporting; calibrated PP3/BP4)
       'acmg2015' – the original combining rules of Richards et al. (2015) */
  framework: 'acgs2024',

  /* Suggestions from the evidence (e.g. "PM2_Supporting: absent from gnomAD") are shown
     next to each criterion. Students still decide; nothing is applied for them.
       'show'   – shown from the start
       'button' – hidden until the student presses "Show suggestions" (the default:
                  students weigh the evidence first)
       'never'  – never shown (for assessments) */
  suggestions: 'button',

  /* Expected answers in case files: whether students may compare their classification
     with the one the case's author gave, once they have saved their own. The answers
     are in the case file, so a determined student can read them: for marked work,
     give out the answer file later. */
  allowCompare: true,

  /* the online services the browser asks (each user's browser asks them directly) */
  services: {
    ensembl: { GRCh38: 'https://rest.ensembl.org', GRCh37: 'https://grch37.rest.ensembl.org' },
    gnomad: 'https://gnomad.broadinstitute.org/api',
    myvariant: 'https://myvariant.info/v1',
    eutils: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    spliceai: { GRCh38: 'https://spliceai-38-xwkwwwxdwq-uc.a.run.app/spliceai/', GRCh37: 'https://spliceai-37-xwkwwwxdwq-uc.a.run.app/spliceai/' },
    uniprot: 'https://rest.uniprot.org',
    alphafold: 'https://alphafold.ebi.ac.uk/api',
    panelapp: 'https://panelapp.genomicsengland.co.uk/api/v1',
    europepmc: 'https://www.ebi.ac.uk/europepmc/webservices/rest',
    /* UCSC's tables (ClinGen dosage regions, ClinVar CNVs, DGV, gnomAD SVs…) for a region */
    ucscApi: 'https://api.genome.ucsc.edu',
    /* UCSC's files for the genome browser: its main server, then its copy on Amazon */
    ucsc: ['https://hgdownload.soe.ucsc.edu', 'https://genome-browser.s3.us-east-1.amazonaws.com']
  },

  /* case files offered on the Cases and data page (in data/cases/) */
  cases: 'data/cases/index.json'
};
