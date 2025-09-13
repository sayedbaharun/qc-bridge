#!/usr/bin/env node
/**
 * Setup Domains Structure - Create the new 3-layer model
 * Run this after clean-slate to establish the new architecture
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🏗️  SETUP DOMAINS STRUCTURE');
console.log('============================\n');

// Domain and Venture definitions
const DOMAINS = [
  { slug: 'health', name: 'Health', description: 'Physical and mental wellbeing' },
  { slug: 'work', name: 'Work', description: 'Professional and business activities' },
  { slug: 'finance', name: 'Finance', description: 'Financial management and investments' },
  { slug: 'family', name: 'Family', description: 'Family relationships and activities' },
  { slug: 'home', name: 'Home', description: 'Home management and maintenance' },
  { slug: 'travel', name: 'Travel', description: 'Travel planning and experiences' },
  { slug: 'learning', name: 'Learning', description: 'Continuous learning and skill development' },
  { slug: 'relationships', name: 'Relationships', description: 'Social connections and community' },
  { slug: 'play', name: 'Play', description: 'Recreation and entertainment' }
];

const VENTURES = {
  work: [
    { slug: 'hikma', name: 'Hikma', description: 'Strategic consulting and advisory services' },
    { slug: 'aivant-realty', name: 'Aivant Realty', description: 'Real estate development and management' },
    { slug: 'amo-syndicate', name: 'AMO Syndicate', description: 'Investment syndication platform' },
    { slug: 'arab-money', name: 'Arab Money', description: 'Financial media and content' },
    { slug: 'mydub', name: 'MyDub', description: 'Dubai lifestyle and services platform' },
    { slug: 'pressure-play', name: 'Pressure Play', description: 'Gaming and entertainment venture' },
    { slug: 'revolv', name: 'Revolv', description: 'Technology and innovation projects' },
    { slug: 'getmetodubai', name: 'GetMeToDubai', description: 'Relocation and settlement services' }
  ],
  health: [
    { slug: 'gym-training', name: 'Gym Training', description: 'Structured fitness and strength training' },
    { slug: 'nutrition', name: 'Nutrition', description: 'Diet planning and nutritional health' },
    { slug: 'medical', name: 'Medical', description: 'Healthcare and medical appointments' },
    { slug: 'mindset', name: 'Mindset', description: 'Mental health and mindfulness practices' }
  ],
  finance: [
    { slug: 'investments', name: 'Investments', description: 'Portfolio management and investment strategies' },
    { slug: 'personal-finance', name: 'Personal Finance', description: 'Personal budgeting and financial planning' },
    { slug: 'tax-planning', name: 'Tax Planning', description: 'Tax optimization and compliance' }
  ],
  learning: [
    { slug: 'rera-exam', name: 'RERA Exam', description: 'Real Estate Regulatory Agency certification' },
    { slug: 'courses', name: 'Courses', description: 'Online courses and educational programs' },
    { slug: 'reading-list', name: 'Reading List', description: 'Books and reading materials' }
  ]
};

async function executeSQL(description, sql) {
  console.log(`📋 ${description}...`);
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    if (error) {
      console.error(`❌ Failed: ${error.message}`);
      return false;
    }
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function createTablesAndStructure() {
  console.log('1. Creating table structure...\n');
  
  const createTablesSQL = `
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Domains table (top-level areas of focus)
    CREATE TABLE IF NOT EXISTS domains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    
    -- Ventures table (sub-areas under domains)
    CREATE TABLE IF NOT EXISTS ventures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      primary_domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    
    -- Update projects table to use new structure
    DO $$ 
    BEGIN
      -- Add area column if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'area'
      ) THEN
        ALTER TABLE projects ADD COLUMN area TEXT;
      END IF;
      
      -- Add venture_id column if it doesn't exist  
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'venture_id'
      ) THEN
        ALTER TABLE projects ADD COLUMN venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL;
      END IF;
    END $$;
    
    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_domains_slug ON domains(slug);
    CREATE INDEX IF NOT EXISTS idx_ventures_slug ON ventures(slug);
    CREATE INDEX IF NOT EXISTS idx_ventures_domain ON ventures(primary_domain_id);
    CREATE INDEX IF NOT EXISTS idx_projects_area ON projects(area);
    CREATE INDEX IF NOT EXISTS idx_projects_venture ON projects(venture_id);
    
    -- Auto-update triggers for updated_at
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ language 'plpgsql';
    
    DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;
    CREATE TRIGGER update_domains_updated_at 
      BEFORE UPDATE ON domains 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    DROP TRIGGER IF EXISTS update_ventures_updated_at ON ventures;
    CREATE TRIGGER update_ventures_updated_at 
      BEFORE UPDATE ON ventures 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;
  
  return await executeSQL('Creating tables and structure', createTablesSQL);
}

async function createCompatibilityLayer() {
  console.log('\n2. Creating compatibility layer...\n');
  
  const compatSQL = `
    -- Area compatibility mapping (legacy bridge)
    CREATE TABLE IF NOT EXISTS area_compat_map (
      legacy_area_key TEXT PRIMARY KEY,
      domain_id UUID REFERENCES domains(id) ON DELETE SET NULL,
      venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      
      -- Constraint: at least one of domain_id or venture_id must be non-null
      CONSTRAINT area_compat_map_check CHECK (
        (domain_id IS NOT NULL) OR (venture_id IS NOT NULL)
      )
    );
    
    -- Indexes for compat mapping
    CREATE INDEX IF NOT EXISTS idx_area_compat_legacy ON area_compat_map(legacy_area_key);
    CREATE INDEX IF NOT EXISTS idx_area_compat_domain ON area_compat_map(domain_id);
    CREATE INDEX IF NOT EXISTS idx_area_compat_venture ON area_compat_map(venture_id);
    
    -- Compatibility view that reproduces legacy "areas" shape
    CREATE OR REPLACE VIEW v_areas_compat AS
    WITH mapped_areas AS (
      SELECT 
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN v.id::text
          WHEN acm.domain_id IS NOT NULL THEN d.id::text
        END as id,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN v.name
          WHEN acm.domain_id IS NOT NULL THEN d.name
        END as name,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN v.description
          WHEN acm.domain_id IS NOT NULL THEN d.description
        END as description,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN v.created_at
          WHEN acm.domain_id IS NOT NULL THEN d.created_at
        END as created_at,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN v.updated_at
          WHEN acm.domain_id IS NOT NULL THEN d.updated_at
        END as updated_at,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN 'venture'
          WHEN acm.domain_id IS NOT NULL THEN 'domain'
        END as source_type,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN v.slug
          WHEN acm.domain_id IS NOT NULL THEN d.slug
        END as slug,
        
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN pd.slug
          ELSE NULL
        END as parent_domain_slug
        
      FROM area_compat_map acm
      LEFT JOIN domains d ON acm.domain_id = d.id
      LEFT JOIN ventures v ON acm.venture_id = v.id
      LEFT JOIN domains pd ON v.primary_domain_id = pd.id
    )
    
    SELECT * FROM mapped_areas
    WHERE id IS NOT NULL
    
    UNION ALL
    
    -- Include domains not in compatibility mapping
    SELECT 
      d.id::text as id,
      d.name,
      d.description,
      d.created_at,
      d.updated_at,
      'domain' as source_type,
      d.slug,
      NULL as parent_domain_slug
    FROM domains d
    WHERE d.slug NOT IN (
      SELECT COALESCE(d2.slug, v2.slug)
      FROM area_compat_map acm2
      LEFT JOIN domains d2 ON acm2.domain_id = d2.id
      LEFT JOIN ventures v2 ON acm2.venture_id = v2.id
    )
    
    UNION ALL
    
    -- Include ventures not in compatibility mapping
    SELECT 
      v.id::text as id,
      v.name,
      v.description,
      v.created_at,
      v.updated_at,
      'venture' as source_type,
      v.slug,
      pd.slug as parent_domain_slug
    FROM ventures v
    JOIN domains pd ON v.primary_domain_id = pd.id
    WHERE v.slug NOT IN (
      SELECT COALESCE(d2.slug, v2.slug)
      FROM area_compat_map acm2
      LEFT JOIN domains d2 ON acm2.domain_id = d2.id
      LEFT JOIN ventures v2 ON acm2.venture_id = v2.id
    );
    
    -- Helper function to resolve area name to domain/venture
    CREATE OR REPLACE FUNCTION resolve_area_to_structure(area_name TEXT)
    RETURNS TABLE(
      resolved_type TEXT,
      domain_slug TEXT,
      venture_slug TEXT,
      domain_id UUID,
      venture_id UUID
    ) 
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      area_key TEXT := LOWER(TRIM(area_name));
    BEGIN
      -- First check compatibility mapping
      RETURN QUERY
      SELECT 
        CASE 
          WHEN acm.venture_id IS NOT NULL THEN 'venture'
          WHEN acm.domain_id IS NOT NULL THEN 'domain'
          ELSE 'unmapped'
        END as resolved_type,
        COALESCE(pd.slug, d.slug) as domain_slug,
        v.slug as venture_slug,
        COALESCE(pd.id, d.id) as domain_id,
        v.id as venture_id
      FROM area_compat_map acm
      LEFT JOIN domains d ON acm.domain_id = d.id
      LEFT JOIN ventures v ON acm.venture_id = v.id
      LEFT JOIN domains pd ON v.primary_domain_id = pd.id
      WHERE acm.legacy_area_key = area_key;
      
      -- If no mapping found, try direct domain match
      IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
          'domain' as resolved_type,
          d.slug as domain_slug,
          NULL::TEXT as venture_slug,
          d.id as domain_id,
          NULL::UUID as venture_id
        FROM domains d
        WHERE d.slug = area_key
        LIMIT 1;
      END IF;
      
      -- If still no match, try direct venture match
      IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
          'venture' as resolved_type,
          pd.slug as domain_slug,
          v.slug as venture_slug,
          pd.id as domain_id,
          v.id as venture_id
        FROM ventures v
        JOIN domains pd ON v.primary_domain_id = pd.id
        WHERE v.slug = area_key
        LIMIT 1;
      END IF;
    END;
    $$;
  `;
  
  return await executeSQL('Creating compatibility layer', compatSQL);
}

async function seedDomains() {
  console.log('\n3. Seeding domains...\n');
  
  for (const domain of DOMAINS) {
    try {
      const { data, error } = await supabase
        .from('domains')
        .upsert(domain, { 
          onConflict: 'slug',
          ignoreDuplicates: false 
        })
        .select()
        .single();
      
      if (error) {
        console.error(`❌ Failed to seed domain ${domain.slug}:`, error.message);
        continue;
      }
      
      console.log(`✅ Domain: ${domain.name} (${domain.slug})`);
    } catch (error) {
      console.error(`❌ Error seeding domain ${domain.slug}:`, error.message);
    }
  }
}

async function seedVentures() {
  console.log('\n4. Seeding ventures...\n');
  
  for (const [domainSlug, ventures] of Object.entries(VENTURES)) {
    console.log(`📂 ${domainSlug.toUpperCase()} ventures:`);
    
    // Get domain ID
    const { data: domain, error: domainError } = await supabase
      .from('domains')
      .select('id')
      .eq('slug', domainSlug)
      .single();
    
    if (domainError || !domain) {
      console.error(`❌ Domain ${domainSlug} not found`);
      continue;
    }
    
    for (const venture of ventures) {
      try {
        const ventureData = {
          ...venture,
          primary_domain_id: domain.id
        };
        
        const { data, error } = await supabase
          .from('ventures')
          .upsert(ventureData, { 
            onConflict: 'slug',
            ignoreDuplicates: false 
          })
          .select()
          .single();
        
        if (error) {
          console.error(`❌ Failed to seed venture ${venture.slug}:`, error.message);
          continue;
        }
        
        console.log(`   ✅ ${venture.name} (${venture.slug})`);
      } catch (error) {
        console.error(`❌ Error seeding venture ${venture.slug}:`, error.message);
      }
    }
  }
}

async function createCompatibilityMappings() {
  console.log('\n5. Creating area compatibility mappings...');
  
  // First, get all existing areas from your current areas table
  try {
    const { data: existingAreas, error } = await supabase
      .from('areas')
      .select('key, name, type');
    
    if (error) {
      console.error('❌ Error fetching existing areas:', error.message);
      return false;
    }
    
    console.log(`\n📋 Found ${existingAreas?.length || 0} existing areas to map...\n`);
    
    // Create mappings for existing areas
    for (const area of existingAreas || []) {
      try {
        let insertData = { legacy_area_key: area.key };
        
        // Map based on area key to new structure
        if (area.key === 'hikma') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'hikma').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'aivant') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'aivant-realty').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'arabmoney') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'arab-money').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'amo') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'amo-syndicate').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (area.key === 'mydub') {
          const { data: venture } = await supabase.from('ventures').select('id').eq('slug', 'mydub').single();
          if (venture) insertData.venture_id = venture.id;
        } else if (['health', 'work', 'finance', 'family', 'home', 'travel', 'learning', 'relationships', 'play'].includes(area.key)) {
          // Map to domain
          const { data: domain } = await supabase.from('domains').select('id').eq('slug', area.key).single();
          if (domain) insertData.domain_id = domain.id;
        } else {
          // Default business areas to work domain
          if (area.type === 'business') {
            const { data: domain } = await supabase.from('domains').select('id').eq('slug', 'work').single();
            if (domain) insertData.domain_id = domain.id;
          } else {
            // Personal areas to relationships domain
            const { data: domain } = await supabase.from('domains').select('id').eq('slug', 'relationships').single();
            if (domain) insertData.domain_id = domain.id;
          }
        }
        
        const { error: insertError } = await supabase
          .from('area_compat_map')
          .upsert(insertData, { onConflict: 'legacy_area_key' });
        
        if (insertError) {
          console.error(`❌ Failed to create mapping for ${area.key}:`, insertError.message);
          continue;
        }
        
        const mappingType = insertData.venture_id ? 'venture' : 'domain';
        console.log(`✅ ${area.key} (${area.name}) → ${mappingType}`);
        
      } catch (error) {
        console.error(`❌ Error creating mapping for ${area.key}:`, error.message);
      }
    }
    
    // Also create standard mappings for new domain/venture names
    const standardMappings = [
      // Domains
      ...DOMAINS.map(d => ({ legacy_area_key: d.slug, domain_slug: d.slug })),
      // Ventures
      ...Object.entries(VENTURES).flatMap(([domainSlug, ventures]) =>
        ventures.map(v => ({ legacy_area_key: v.slug, venture_slug: v.slug }))
      )
    ];
    
    console.log('\n📋 Creating standard name mappings...');
    
    for (const mapping of standardMappings) {
      try {
        let insertData = { legacy_area_key: mapping.legacy_area_key };
        
        if (mapping.domain_slug) {
          const { data: domain } = await supabase
            .from('domains')
            .select('id')
            .eq('slug', mapping.domain_slug)
            .single();
          if (domain) insertData.domain_id = domain.id;
        }
        
        if (mapping.venture_slug) {
          const { data: venture } = await supabase
            .from('ventures')
            .select('id')
            .eq('slug', mapping.venture_slug)
            .single();
          if (venture) insertData.venture_id = venture.id;
        }
        
        const { error } = await supabase
          .from('area_compat_map')
          .upsert(insertData, { onConflict: 'legacy_area_key' });
        
        if (!error) {
          const type = mapping.domain_slug ? 'domain' : 'venture';
          console.log(`✅ ${mapping.legacy_area_key} → ${type} (standard)`);
        }
        
      } catch (error) {
        // Ignore errors for standard mappings that might conflict
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error in compatibility mapping:', error.message);
    return false;
  }
}

async function updateRPCFunction() {
  console.log('\n6. Creating enhanced RPC function...\n');
  
  const rpcSQL = `
    -- Enhanced create_or_update_task function with domain/venture support
    CREATE OR REPLACE FUNCTION create_or_update_task(
      p_title TEXT,
      p_area TEXT,
      p_project_name TEXT DEFAULT NULL,
      p_milestone_name TEXT DEFAULT NULL,
      p_priority TEXT DEFAULT NULL,
      p_due_date TIMESTAMPTZ DEFAULT NULL,
      p_assignee TEXT DEFAULT NULL,
      p_status TEXT DEFAULT NULL,
      p_focus_slot TEXT DEFAULT NULL,
      p_focus_date TIMESTAMPTZ DEFAULT NULL,
      p_notion_page_id TEXT DEFAULT NULL,
      p_external_hash TEXT DEFAULT NULL
    )
    RETURNS JSON
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      v_project_id UUID;
      v_milestone_id UUID;
      v_task_id UUID;
      v_area_resolution RECORD;
      v_created BOOLEAN := FALSE;
      v_updated BOOLEAN := FALSE;
      v_result JSON;
    BEGIN
      -- Resolve area to domain/venture structure
      SELECT * INTO v_area_resolution 
      FROM resolve_area_to_structure(p_area) 
      LIMIT 1;
      
      IF v_area_resolution.resolved_type IS NULL THEN
        RAISE EXCEPTION 'Area "%" could not be resolved to domain or venture', p_area;
      END IF;
      
      -- Handle project creation/lookup
      IF p_project_name IS NOT NULL THEN
        -- Look for existing project first
        SELECT id INTO v_project_id
        FROM projects 
        WHERE LOWER(name) = LOWER(p_project_name) 
        AND area = p_area;
        
        -- Create project if not found
        IF v_project_id IS NULL THEN
          INSERT INTO projects (name, area, venture_id, description, created_at)
          VALUES (
            p_project_name, 
            p_area,
            v_area_resolution.venture_id,
            CASE 
              WHEN v_area_resolution.resolved_type = 'venture' 
              THEN 'Project under ' || v_area_resolution.venture_slug || ' venture'
              ELSE 'Project under ' || v_area_resolution.domain_slug || ' domain'
            END,
            now()
          )
          RETURNING id INTO v_project_id;
        END IF;
      END IF;
      
      -- Handle milestone creation/lookup
      IF p_milestone_name IS NOT NULL AND v_project_id IS NOT NULL THEN
        SELECT id INTO v_milestone_id
        FROM milestones 
        WHERE LOWER(name) = LOWER(p_milestone_name) 
        AND project_id = v_project_id;
        
        IF v_milestone_id IS NULL THEN
          INSERT INTO milestones (name, project_id, created_at)
          VALUES (p_milestone_name, v_project_id, now())
          RETURNING id INTO v_milestone_id;
        END IF;
      END IF;
      
      -- Check for existing task by external hash or notion page id
      SELECT id INTO v_task_id
      FROM tasks 
      WHERE (p_external_hash IS NOT NULL AND external_hash = p_external_hash)
         OR (p_notion_page_id IS NOT NULL AND notion_page_id = p_notion_page_id);
      
      -- Create or update task
      IF v_task_id IS NULL THEN
        -- Create new task
        INSERT INTO tasks (
          name, area, project_id, milestone_id, priority, due_date, 
          assignee_email, status, focus_slot, focus_date, 
          notion_page_id, external_hash, created_at
        )
        VALUES (
          p_title, p_area, v_project_id, v_milestone_id, p_priority, p_due_date,
          p_assignee, p_status, p_focus_slot, p_focus_date,
          p_notion_page_id, p_external_hash, now()
        )
        RETURNING id INTO v_task_id;
        
        v_created := TRUE;
      ELSE
        -- Update existing task
        UPDATE tasks SET
          name = p_title,
          area = p_area,
          project_id = COALESCE(v_project_id, project_id),
          milestone_id = COALESCE(v_milestone_id, milestone_id),
          priority = COALESCE(p_priority, priority),
          due_date = COALESCE(p_due_date, due_date),
          assignee_email = COALESCE(p_assignee, assignee_email),
          status = COALESCE(p_status, status),
          focus_slot = COALESCE(p_focus_slot, focus_slot),
          focus_date = COALESCE(p_focus_date, focus_date),
          external_hash = COALESCE(p_external_hash, external_hash),
          updated_at = now()
        WHERE id = v_task_id;
        
        v_updated := TRUE;
      END IF;
      
      -- Update integrations_notion record
      IF p_notion_page_id IS NOT NULL THEN
        INSERT INTO integrations_notion (notion_page_id, task_id, external_hash, last_seen_at)
        VALUES (p_notion_page_id, v_task_id, p_external_hash, now())
        ON CONFLICT (notion_page_id) 
        DO UPDATE SET 
          task_id = EXCLUDED.task_id,
          external_hash = EXCLUDED.external_hash,
          last_seen_at = EXCLUDED.last_seen_at;
      END IF;
      
      -- Build result
      SELECT json_build_object(
        'task_id', v_task_id,
        'created', v_created,
        'updated', v_updated,
        'area_resolution', json_build_object(
          'type', v_area_resolution.resolved_type,
          'domain_slug', v_area_resolution.domain_slug,
          'venture_slug', v_area_resolution.venture_slug
        )
      ) INTO v_result;
      
      RETURN v_result;
    END;
    $$;
  `;
  
  return await executeSQL('Creating enhanced RPC function', rpcSQL);
}

async function verifySetup() {
  console.log('\n7. Verifying setup...\n');
  
  try {
    // Count domains
    const { count: domainCount, error: domainError } = await supabase
      .from('domains')
      .select('*', { count: 'exact', head: true });
    
    // Count ventures
    const { count: ventureCount, error: ventureError } = await supabase
      .from('ventures')
      .select('*', { count: 'exact', head: true });
      
    // Count mappings
    const { count: mappingCount, error: mappingError } = await supabase
      .from('area_compat_map')
      .select('*', { count: 'exact', head: true });
    
    if (domainError || ventureError || mappingError) {
      console.error('❌ Error verifying setup');
      return false;
    }
    
    console.log(`✅ ${domainCount} domains created`);
    console.log(`✅ ${ventureCount} ventures created`);
    console.log(`✅ ${mappingCount} compatibility mappings created`);
    
    // Test area resolution
    console.log('\n🧪 Testing area resolution:');
    const testAreas = ['health', 'hikma', 'work', 'nutrition'];
    
    for (const area of testAreas) {
      const { data: resolution } = await supabase.rpc('resolve_area_to_structure', { area_name: area });
      if (resolution && resolution.length > 0) {
        const res = resolution[0];
        console.log(`   ✅ "${area}" → ${res.resolved_type}: ${res.venture_slug || res.domain_slug}`);
      } else {
        console.log(`   ❌ "${area}" → unresolved`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE environment variables');
    process.exit(1);
  }
  
  console.log('🚀 Setting up the new 3-layer domain structure...\n');
  
  // Step-by-step setup
  const success = await createTablesAndStructure() &&
                  await createCompatibilityLayer() &&
                  await seedDomains() &&
                  await seedVentures() &&
                  await createCompatibilityMappings() &&
                  await updateRPCFunction() &&
                  await verifySetup();
  
  console.log('\n🎯 SETUP SUMMARY');
  console.log('================');
  
  if (success) {
    console.log('✅ Domain structure setup completed successfully!');
    console.log('');
    console.log('📋 New structure:');
    console.log('   Domains (9) → Life areas like Health, Work, Finance');
    console.log('   Ventures (18) → Specific activities under domains');
    console.log('   Projects → Link to ventures, inherit domain context');
    console.log('   Tasks → Inherit area from project hierarchy');
    console.log('');
    console.log('🔄 Bridge compatibility:');
    console.log('   ✅ Area resolution function created');
    console.log('   ✅ Enhanced RPC function deployed');
    console.log('   ✅ Compatibility view available');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('1. Test bridge: npm run dry-run');
    console.log('2. Create a task in Notion with Area = "health" or "hikma"');
    console.log('3. Run: npm run once');
    console.log('4. Verify the new structure handles the mapping correctly');
  } else {
    console.log('❌ Setup encountered errors - check messages above');
  }
}

main().catch(console.error);