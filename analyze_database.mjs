import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

console.log('🔍 Analyzing Supabase Database for Migration Planning');
console.log('=====================================================\n');

async function analyzeBrands() {
  console.log('📊 1. CURRENT BRANDS ANALYSIS');
  console.log('==============================');
  
  try {
    const { data: brands, error } = await supabase
      .from('brands')
      .select('*')
      .order('created_at');
    
    if (error) throw error;
    
    console.log(`Found ${brands.length} brands:`);
    brands.forEach(brand => {
      console.log(`  - ${brand.name} (ID: ${brand.id})`);
      console.log(`    Description: ${brand.description || 'N/A'}`);
      console.log(`    Created: ${brand.created_at}`);
      console.log(`    Updated: ${brand.updated_at || 'N/A'}`);
      console.log('');
    });
    
    return brands;
  } catch (error) {
    console.error('Error fetching brands:', error.message);
    return [];
  }
}

async function analyzeProjects() {
  console.log('📁 2. CURRENT PROJECTS AND BRAND ASSOCIATIONS');
  console.log('==============================================');
  
  try {
    // First get projects without joins to see what data exists
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at');
    
    if (error) throw error;
    
    console.log(`Found ${projects.length} projects:`);
    
    // Get brands data separately for reference
    const { data: brands, error: brandError } = await supabase
      .from('brands')
      .select('id, name');
    
    const brandMap = {};
    if (!brandError && brands) {
      brands.forEach(brand => {
        brandMap[brand.id] = brand.name;
      });
    }
    
    projects.forEach(project => {
      console.log(`  - ${project.name} (ID: ${project.id})`);
      console.log(`    Brand: ${brandMap[project.brand_id] || 'No brand'} (Brand ID: ${project.brand_id})`);
      console.log(`    Description: ${project.description || 'N/A'}`);
      console.log(`    Created: ${project.created_at}`);
      console.log(`    Updated: ${project.updated_at || 'N/A'}`);
      console.log('');
    });
    
    return projects;
  } catch (error) {
    console.error('Error fetching projects:', error.message);
    return [];
  }
}

async function analyzeTasks() {
  console.log('📝 3. SAMPLE TASKS DATA PATTERNS');
  console.log('=================================');
  
  try {
    // Get tasks without complex joins first
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .limit(10)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    console.log(`Sample of ${tasks.length} recent tasks:`);
    
    // Get related data separately
    const { data: projects, error: projError } = await supabase
      .from('projects')
      .select('id, name, brand_id');
    
    const { data: brands, error: brandError } = await supabase
      .from('brands')
      .select('id, name');
    
    const { data: milestones, error: milError } = await supabase
      .from('milestones')
      .select('id, name');
    
    // Create lookup maps
    const projectMap = {};
    const brandMap = {};
    const milestoneMap = {};
    
    if (!projError && projects) {
      projects.forEach(proj => {
        projectMap[proj.id] = proj;
      });
    }
    
    if (!brandError && brands) {
      brands.forEach(brand => {
        brandMap[brand.id] = brand.name;
      });
    }
    
    if (!milError && milestones) {
      milestones.forEach(milestone => {
        milestoneMap[milestone.id] = milestone.name;
      });
    }
    
    tasks.forEach(task => {
      const project = projectMap[task.project_id];
      const brandName = project ? brandMap[project.brand_id] : 'No brand';
      
      console.log(`  - ${task.title} (ID: ${task.id})`);
      console.log(`    Project: ${project?.name || 'No project'}`);
      console.log(`    Brand: ${brandName}`);
      console.log(`    Milestone: ${milestoneMap[task.milestone_id] || 'No milestone'}`);
      console.log(`    Priority: ${task.priority || 'No priority'}`);
      console.log(`    Status: ${task.status || 'No status'}`);
      console.log(`    Due: ${task.due_date || 'No due date'}`);
      console.log(`    Assignee: ${task.assignee_email || 'Unassigned'}`);
      console.log(`    Created: ${task.created_at}`);
      console.log('');
    });
    
    // Get all tasks for count analysis
    const { data: allTasks, error: allError } = await supabase
      .from('tasks')
      .select('project_id');
    
    if (!allError && allTasks) {
      const brandTaskCounts = {};
      allTasks.forEach(task => {
        const project = projectMap[task.project_id];
        const brandName = project ? brandMap[project.brand_id] || 'No brand' : 'No project';
        brandTaskCounts[brandName] = (brandTaskCounts[brandName] || 0) + 1;
      });
      
      console.log('📈 Task counts by brand:');
      Object.entries(brandTaskCounts).forEach(([brand, count]) => {
        console.log(`  - ${brand}: ${count} tasks`);
      });
      console.log('');
    }
    
    return tasks;
  } catch (error) {
    console.error('Error fetching tasks:', error.message);
    return [];
  }
}

async function identifyMigrationIssues(brands, projects, tasks) {
  console.log('⚠️  4. MIGRATION CONFLICT ANALYSIS');
  console.log('==================================');
  
  const issues = [];
  
  // Check for orphaned projects (projects without brands)
  const orphanedProjects = projects.filter(p => !p.brand_id);
  if (orphanedProjects.length > 0) {
    issues.push({
      type: 'orphaned_projects',
      count: orphanedProjects.length,
      description: 'Projects without brand assignments',
      items: orphanedProjects.map(p => ({ id: p.id, name: p.name }))
    });
  }
  
  // Check for brands with no projects
  const brandsWithProjects = new Set(projects.map(p => p.brand_id).filter(Boolean));
  const unusedBrands = brands.filter(b => !brandsWithProjects.has(b.id));
  if (unusedBrands.length > 0) {
    issues.push({
      type: 'unused_brands',
      count: unusedBrands.length,
      description: 'Brands with no associated projects',
      items: unusedBrands.map(b => ({ id: b.id, name: b.name }))
    });
  }
  
  // Check for potential naming conflicts
  const brandNames = brands.map(b => b.name.toLowerCase());
  const duplicateBrandNames = brandNames.filter((name, index) => brandNames.indexOf(name) !== index);
  if (duplicateBrandNames.length > 0) {
    issues.push({
      type: 'duplicate_brand_names',
      count: duplicateBrandNames.length,
      description: 'Brands with duplicate names (case-insensitive)',
      items: duplicateBrandNames
    });
  }
  
  // Note: Foreign key constraints will need to be checked manually in the database
  // These typically exist between projects.brand_id -> brands.id
  
  console.log(`Found ${issues.length} potential migration issues:`);
  issues.forEach((issue, index) => {
    console.log(`\n${index + 1}. ${issue.description} (${issue.count} items)`);
    if (issue.items && issue.items.length > 0) {
      issue.items.slice(0, 5).forEach(item => {
        if (typeof item === 'object') {
          console.log(`   - ${item.name} (ID: ${item.id})`);
        } else {
          console.log(`   - ${item}`);
        }
      });
      if (issue.items.length > 5) {
        console.log(`   ... and ${issue.items.length - 5} more`);
      }
    }
  });
  
  return issues;
}

async function generateMigrationPlan(brands, projects, tasks, issues) {
  console.log('\n📋 5. MIGRATION PLAN RECOMMENDATIONS');
  console.log('====================================');
  
  console.log('Based on the analysis, here\'s the recommended migration approach:');
  console.log('');
  
  console.log('STEP 1: Pre-migration preparation');
  console.log('----------------------------------');
  console.log('• Create backup of current database');
  console.log('• Create new task_types table with structure:');
  console.log('  - id (UUID, primary key)');
  console.log('  - name (text, e.g., "business", "personal")');
  console.log('  - description (text)');
  console.log('  - created_at, updated_at (timestamps)');
  console.log('');
  
  console.log('STEP 2: Data migration strategy');
  console.log('--------------------------------');
  console.log('• Insert "business" task_type');
  console.log('• Insert "personal" task_type (if needed)');
  console.log('• Add task_type_id column to projects table');
  console.log('• Migrate all existing projects to "business" task_type');
  console.log('');
  
  console.log('STEP 3: Handle identified issues');
  console.log('---------------------------------');
  issues.forEach(issue => {
    console.log(`• ${issue.description}: ${issue.count} items need attention`);
  });
  console.log('');
  
  console.log('STEP 4: Update application code');
  console.log('--------------------------------');
  console.log('• Update create_task_from_capture_by_names function');
  console.log('• Modify queries to use task_types instead of brands');
  console.log('• Update UI to show task types instead of brands');
  console.log('');
  
  console.log('STEP 5: Clean up');
  console.log('-----------------');
  console.log('• Remove brand_id foreign key constraint from projects');
  console.log('• Drop brands table (after confirming data integrity)');
  console.log('• Update indexes and constraints');
  console.log('');
  
  // Generate specific data mapping
  console.log('DATA MAPPING SUMMARY:');
  console.log('--------------------');
  brands.forEach(brand => {
    const brandProjects = projects.filter(p => p.brand_id === brand.id);
    console.log(`• Brand "${brand.name}" → Task Type "business"`);
    console.log(`  Projects to migrate: ${brandProjects.length}`);
    brandProjects.forEach(project => {
      console.log(`    - ${project.name} (${project.id})`);
    });
    console.log('');
  });
}

// Main execution
async function main() {
  try {
    const brands = await analyzeBrands();
    const projects = await analyzeProjects();
    const tasks = await analyzeTasks();
    const issues = await identifyMigrationIssues(brands, projects, tasks);
    
    await generateMigrationPlan(brands, projects, tasks, issues);
    
    console.log('\n✅ Database analysis complete!');
    console.log('\nNext steps:');
    console.log('1. Review the migration plan above');
    console.log('2. Create database backup');
    console.log('3. Test migration on staging environment');
    console.log('4. Execute migration in production');
    
  } catch (error) {
    console.error('Analysis failed:', error);
  }
}

main();